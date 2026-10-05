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
from xml.etree import ElementTree
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pdf2image import convert_from_path, pdfinfo_from_path
from PIL import Image
from pptxtoimages.tools import PPTXToImageConverter

LIMIT = 200 * 1024 * 1024
BUNDLE_LIMIT = 32 * 1024 * 1024
IMAGE_BUNDLE_TYPE = 'application/vnd.bd10.slide-images+zip'
LOCK = threading.Lock()

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
    def __init__(self, source, root, count):
        super().__init__(str(source), output_dir=str(root / 'slides'),
                         output_format='webp', temp_dir=str(root / 'pdf-temp'))
        self.root, self.expected_count = root, count
        self.deadline = time.monotonic() + 110
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
            check=True, timeout=self.remaining(90), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pdf = pathlib.Path(self.temp_dir) / 'source.pdf'
        with pdf.open('rb') as file:
            prefix = file.read(5)
        if prefix != b'%PDF-' or pdf.stat().st_size > BUNDLE_LIMIT:
            raise ValueError('Invalid PDF output')
        shutil.copyfile(pdf, self.root / 'lesson.pdf')
        return str(pdf)

    def _convert_pdf_to_images(self, pdf_path):
        count = int(pdfinfo_from_path(pdf_path, timeout=self.remaining(10))['Pages'])
        if count != self.expected_count:
            raise ValueError('Generated page count differs from the original')
        pathlib.Path(self.output_dir).mkdir()
        (self.root / 'thumbnails').mkdir()
        output = []
        total_bytes = (self.root / 'lesson.pdf').stat().st_size
        for order in range(1, count + 1):
            pages = convert_from_path(pdf_path, dpi=200, size=1920, first_page=order,
                                      last_page=order, thread_count=1, strict=True,
                                      timeout=self.remaining(30))
            if len(pages) != 1:
                raise ValueError('Missing slide image')
            image_name = f'slides/{order:04d}.webp'
            thumb_name = f'thumbnails/{order:04d}.webp'
            with pages[0] as page:
                page.save(self.root / image_name, 'WEBP', quality=95, method=4)
                width, height = page.size
                with page.copy() as thumbnail:
                    thumbnail.thumbnail((320, 320), Image.Resampling.LANCZOS)
                    thumbnail.save(self.root / thumb_name, 'WEBP', quality=90, method=4)
                    tw, th = thumbnail.size
            total_bytes += (self.root / image_name).stat().st_size + (self.root / thumb_name).stat().st_size
            if total_bytes > BUNDLE_LIMIT - 128 * 1024:
                raise ValueError('Generated slide package exceeds the hosting limit')
            self.manifest_slides.append(dict(order=order, image=image_name, thumbnail=thumb_name,
                                            width=width, height=height, thumbnailWidth=tw, thumbnailHeight=th))
            output.append(str(self.root / image_name))
        return output


def convert(data, images=False):
    with tempfile.TemporaryDirectory(prefix='bd10-slides-') as work:
        root = pathlib.Path(work)
        source = root / 'source.pptx'
        source.write_bytes(data)
        converter = BD10Converter(source, root, validate_source(source))
        if not images:
            converter._convert_pptx_to_pdf()  # Preserve the existing PDF endpoint contract.
            return (root / 'lesson.pdf').read_bytes()
        output = converter.convert()  # Real upstream pptxtoimages entry point.
        manifest = dict(version=1, renderer='pptxtoimages@0.1.14',
                        sourceSha256=hashlib.sha256(data).hexdigest(),
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

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log headers, credentials, filenames or document contents.

    def do_GET(self):
        if self.path != '/health':
            self.send_error(404); return
        result = b'{"status":"ok","service":"bd10-slide-converter"}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(result)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(result)

    def do_POST(self):
        token = os.environ.get('SLIDE_CONVERTER_TOKEN', '')
        if self.path != '/convert' or not token or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token):
            self.send_error(403); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400); return
        if not 4 <= size <= LIMIT:
            self.send_error(413); return
        if not LOCK.acquire(blocking=False):
            self.send_error(429); return
        self.connection.settimeout(30)
        try:
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
            LOCK.release()

if __name__ == '__main__':
    if not os.environ.get('SLIDE_CONVERTER_TOKEN'):
        raise SystemExit('SLIDE_CONVERTER_TOKEN must be configured')
    ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler).serve_forever()
