"""Private pptxtoimages adapter. Render whole slides, never reconstructed HTML."""
import hashlib
import hmac
import io
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time
import zipfile
import uuid
from xml.etree import ElementTree
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pdf2image import convert_from_path, pdfinfo_from_path
from PIL import Image
from pptxtoimages.tools import PPTXToImageConverter

LIMIT = 200 * 1024 * 1024
BUNDLE_LIMIT = 32 * 1024 * 1024
IMAGE_BUNDLE_TYPE = 'application/vnd.bd10.slide-images+zip'
LOCK = threading.Lock()
JOBS = {}
JOBS_LOCK = threading.Lock()

def validate_source(source):
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        if names.count('ppt/presentation.xml') != 1 or any('vbaproject' in x.lower() for x in names):
            raise ValueError('Only macro-free PPTX presentations are supported')
        if sum(x.file_size for x in archive.infolist()) > 1024 * 1024 * 1024:
            raise ValueError('Expanded presentation is too large')
        if archive.getinfo('ppt/presentation.xml').file_size > 5 * 1024 * 1024:
            raise ValueError('Presentation metadata is too large')
        xml = ElementTree.fromstring(archive.read('ppt/presentation.xml'))
        namespace = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
        count = len(xml.findall('./' + namespace + 'sldIdLst/' + namespace + 'sldId'))
        if not 1 <= count <= 300:
            raise ValueError('Invalid slide count')
        return count


class BD10Converter(PPTXToImageConverter):
    """Use upstream convert(), with isolated LO and bounded one-page rendering.

    Upstream loads every PIL page simultaneously and has no process timeout.
    These two hooks retain its LibreOffice -> pdf2image pipeline while bounding
    memory, preserving macro protection and keeping the saved PDF for retries.
    """
    def __init__(self, source, root, count, timeout_seconds=110, on_progress=None):
        super().__init__(str(source), output_dir=str(root / 'slides'),
                         output_format='webp', temp_dir=str(root / 'pdf-temp'))
        self.root, self.expected_count = root, count
        self.deadline = time.monotonic() + timeout_seconds
        self.on_progress = on_progress or (lambda *_: None)
        self.manifest_slides = []

    def remaining(self, maximum):
        seconds = self.deadline - time.monotonic()
        if seconds <= 0:
            raise TimeoutError('Conversion time limit exceeded')
        return min(maximum, seconds)

    def _convert_pptx_to_pdf(self):
        pathlib.Path(self.temp_dir).mkdir()
        profile = self.root / 'profile'
        profile.mkdir()
        (profile / 'user').mkdir()
        (profile / 'user' / 'registrymodifications.xcu').write_text(
            '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry">'
            '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
            '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>'
            '</item></oor:items>')
        subprocess.run([os.environ.get('SOFFICE', 'soffice'), '--headless', '--nologo',
            '--nodefault', '--norestore', '-env:UserInstallation=' + profile.as_uri(),
            '--convert-to', 'pdf:impress_pdf_Export', '--outdir', self.temp_dir, self.pptx_path],
            check=True, timeout=self.remaining(240 if pathlib.Path(self.pptx_path).stat().st_size > 32 * 1024 * 1024 else 90), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pdf = pathlib.Path(self.temp_dir) / 'source.pdf'
        with pdf.open('rb') as file:
            prefix = file.read(5)
        if prefix != b'%PDF-' or pdf.stat().st_size > BUNDLE_LIMIT:
            raise ValueError('Invalid PDF output')
        shutil.copyfile(pdf, self.root / 'lesson.pdf')
        self.on_progress('rendering', 0, self.expected_count)
        return str(pdf)

    def _convert_pdf_to_images(self, pdf_path):
        count = int(pdfinfo_from_path(pdf_path, timeout=self.remaining(10))['Pages'])
        if count != self.expected_count:
            raise ValueError('Generated page count differs from the original')
        pathlib.Path(self.output_dir).mkdir()
        (self.root / 'thumbnails').mkdir()
        output = []
        total_bytes = (self.root / 'lesson.pdf').stat().st_size
        # Reuse Poppler across small batches; keep only one PIL page in memory.
        # PPM avoids a second lossy encoding and bounds temporary disk usage.
        raster = self.root / 'raster'
        raster.mkdir()
        for order in range(1, count + 1):
            if (order - 1) % 8 == 0:
                page_paths = convert_from_path(pdf_path, dpi=200, size=1920, first_page=order,
                    last_page=min(order + 7, count), thread_count=1, strict=True,
                    output_folder=str(raster), paths_only=True, fmt='ppm', timeout=self.remaining(240 if pathlib.Path(self.pptx_path).stat().st_size > 32 * 1024 * 1024 else 90))
                if len(page_paths) != min(8, count - order + 1):
                    raise ValueError('Missing slide image')
            page_path = pathlib.Path(page_paths[(order - 1) % 8])
            image_name = f'slides/{order:04d}.webp'
            thumb_name = f'thumbnails/{order:04d}.webp'
            with Image.open(page_path) as page:
                page.save(self.root / image_name, 'WEBP', quality=95, method=4)
                width, height = page.size
                with page.copy() as thumbnail:
                    thumbnail.thumbnail((320, 320), Image.Resampling.LANCZOS)
                    thumbnail.save(self.root / thumb_name, 'WEBP', quality=90, method=4)
                    tw, th = thumbnail.size
            page_path.unlink()
            total_bytes += (self.root / image_name).stat().st_size + (self.root / thumb_name).stat().st_size
            if total_bytes > BUNDLE_LIMIT - 128 * 1024:
                raise ValueError('Generated slide package exceeds the hosting limit')
            self.manifest_slides.append(dict(order=order, image=image_name, thumbnail=thumb_name,
                                            width=width, height=height, thumbnailWidth=tw, thumbnailHeight=th))
            output.append(str(self.root / image_name))
            self.on_progress('rendering', order, count)
        return output


def file_sha256(path):
    digest = hashlib.sha256()
    with pathlib.Path(path).open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def convert(data, images=False, timeout_seconds=110, on_progress=None):
    with tempfile.TemporaryDirectory(prefix='bd10-slides-') as work:
        root = pathlib.Path(work)
        source = root / 'source.pptx'
        if isinstance(data, pathlib.Path):
            shutil.copyfile(data, source)
        else:
            source.write_bytes(data)
        converter = BD10Converter(source, root, validate_source(source), timeout_seconds, on_progress)
        if not images:
            converter._convert_pptx_to_pdf()  # Preserve the existing PDF endpoint contract.
            return (root / 'lesson.pdf').read_bytes()
        output = converter.convert()  # Real upstream pptxtoimages entry point.
        manifest = dict(version=1, renderer='pptxtoimages@0.1.14',
                        sourceSha256=file_sha256(source),
                        slideCount=len(output), slides=converter.manifest_slides)
        bundle = io.BytesIO()
        with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_STORED) as archive:
            archive.writestr('manifest.json', json.dumps(manifest, separators=(',', ':')))
            archive.write(root / 'lesson.pdf', 'lesson.pdf')
            for slide in converter.manifest_slides:
                for field in ('image', 'thumbnail'):
                    archive.write(root / slide[field], slide[field])
        if bundle.tell() > BUNDLE_LIMIT:
            raise ValueError('Generated slide package exceeds the hosting limit')
        return bundle.getvalue()


def job_summary(job):
    return {key: job[key] for key in ('id', 'status', 'stage', 'slideCount', 'completedSlides', 'sourceSha256')}


def run_job(job, data):
    def progress(stage, completed, total):
        with JOBS_LOCK:
            job.update(stage=stage, completedSlides=completed, slideCount=total)
    try:
        result = convert(data, images=True,
            timeout_seconds=min(1800, max(180, 90 + job['slideCount'] * 8)), on_progress=progress)
        with JOBS_LOCK:
            job.update(status='ready', stage='ready', result=result, finishedAt=time.monotonic())
        print(json.dumps({'event': 'conversion-ready', 'jobId': job['id'], 'slides': job['slideCount']}), flush=True)
    except Exception as cause:
        with JOBS_LOCK:
            job.update(status='failed', stage='failed', finishedAt=time.monotonic())
        print(json.dumps({'event': 'conversion-failed', 'jobId': job['id'], 'errorType': type(cause).__name__}), flush=True)
    finally:
        if isinstance(data, pathlib.Path):
            data.unlink(missing_ok=True)
        LOCK.release()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log headers, credentials, filenames or document contents.

    def do_GET(self):
        if self.path == '/health':
            self.output(b'{"status":"ok","service":"bd10-slide-converter"}', 'application/json'); return
        if not self.authorized():
            self.send_error(403); return
        parts = self.path.split('/')
        if len(parts) not in (3, 4) or parts[1] != 'jobs' or (len(parts) == 4 and parts[3] != 'result'):
            self.send_error(404); return
        with JOBS_LOCK:
            job = JOBS.get(parts[2])
            if not job or (job.get('finishedAt') and time.monotonic() - job['finishedAt'] > 3600):
                JOBS.pop(parts[2], None)
                self.send_error(404); return
            summary = job_summary(job)
            result = job.get('result') if len(parts) == 4 else None
        if len(parts) == 3:
            self.output(json.dumps(summary).encode(), 'application/json'); return
        if not result:
            self.send_error(422 if summary['status'] == 'failed' else 409); return
        self.output(result, IMAGE_BUNDLE_TYPE)

    def authorized(self):
        token = os.environ.get('SLIDE_CONVERTER_TOKEN', '')
        return bool(token) and hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)

    def output(self, result, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(result)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(result)

    def do_POST(self):
        if self.path not in ('/convert', '/jobs') or not self.authorized():
            self.send_error(403); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400); return
        if not 4 <= size <= LIMIT:
            self.send_error(413); return
        if not LOCK.acquire(blocking=False):
            self.send_error(429); return
        self.connection.settimeout(300)
        try:
            if self.path == '/jobs':
                # Stream large originals to disk; don't retain 200 MB in RAM
                # alongside LibreOffice and the rendered image package.
                with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as source:
                    remaining = size
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk: raise ValueError('Incomplete request')
                        source.write(chunk); remaining -= len(chunk)
                    source.flush()
                    data = pathlib.Path(source.name)
                    count = validate_source(source.name)
                with JOBS_LOCK:
                    # Keep a bounded result cache. The source remains in BD10 R2.
                    completed = sorted((key for key in JOBS if JOBS[key]['status'] != 'processing'),
                        key=lambda key: JOBS[key].get('finishedAt', 0))
                    for key in completed[:-2]:
                        del JOBS[key]
                    job = dict(id=str(uuid.uuid4()), status='processing', stage='converting',
                        slideCount=count, completedSlides=0, sourceSha256=file_sha256(data))
                    JOBS[job['id']] = job
                thread = threading.Thread(target=run_job, args=(job, data), daemon=True)
                thread.start()
                # The conversion thread owns LOCK until its native job finishes.
                handed_off = True
                self.output(json.dumps(job_summary(job)).encode(), 'application/json', 202)
                return
            data = self.rfile.read(size)
            if len(data) != size: raise ValueError('Incomplete request')
            images = IMAGE_BUNDLE_TYPE in self.headers.get('Accept', '')
            result = convert(data, images=images)
            self.send_response(200)
            self.send_header('Content-Type', IMAGE_BUNDLE_TYPE if images else 'application/pdf')
            self.send_header('Content-Length', str(len(result)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(result)
        except Exception:
            self.send_error(422, 'Presentation conversion failed')
        finally:
            if not locals().get('handed_off', False):
                if isinstance(locals().get('data'), pathlib.Path):
                    data.unlink(missing_ok=True)
                elif 'source' in locals():
                    pathlib.Path(source.name).unlink(missing_ok=True)
                LOCK.release()

if __name__ == '__main__':
    if not os.environ.get('SLIDE_CONVERTER_TOKEN'):
        raise SystemExit('SLIDE_CONVERTER_TOKEN must be configured')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
