from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter

root = Path(__file__).resolve().parent
text = (root / 'm2-synthetic-cv.txt').read_text().replace('Alex Example', 'Alex M4 Example')
(root / 'm4-synthetic-cv.txt').write_text(text)
(root / 'm4-synthetic-cv.md').write_text(text)
pdf_path = root / 'm4-selectable-cv.pdf'
c = canvas.Canvas(str(pdf_path), pagesize=A4)
c.setTitle('CareerFlow M4 Synthetic Selectable CV')
t = c.beginText(48, A4[1] - 52)
t.setFont('Helvetica', 11)
t.setLeading(18)
# Wrap long content into readable lines without changing section headings.
import textwrap
for line in text.splitlines():
    for part in textwrap.wrap(line, width=88) or ['']:
        t.textLine(part)
c.drawText(t)
c.save()

image = Image.new('RGB', (1000, 1400), 'white')
draw = ImageDraw.Draw(image)
draw.text((60, 70), 'Synthetic image-only CV - no selectable text', fill='black')
stream = BytesIO()
image.save(stream, format='PNG')
stream.seek(0)
c = canvas.Canvas(str(root / 'm4-image-only-cv.pdf'), pagesize=A4)
c.setTitle('CareerFlow M4 Synthetic Image-only CV')
c.drawImage(ImageReader(stream), 0, 0, width=A4[0], height=A4[1])
c.save()

writer = PdfWriter()
for page in PdfReader(str(pdf_path)).pages:
    writer.add_page(page)
writer.encrypt('synthetic-m4-test-password')
with (root / 'm4-encrypted-cv.pdf').open('wb') as f:
    writer.write(f)
for path in sorted(root.glob('m4-*cv.*')):
    print(path.name, path.stat().st_size, 'bytes')
