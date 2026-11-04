"""Write a .ico that embeds PNG images (supported by every current browser): make-ico.py out.ico a.png [b.png ...]"""
import struct
import sys

out, *pngs = sys.argv[1:]
data = [open(p, "rb").read() for p in pngs]
header = struct.pack("<HHH", 0, 1, len(data))
offset = 6 + 16 * len(data)
entries, blobs = b"", b""
for d in data:
    w, h = struct.unpack(">II", d[16:24])  # PNG IHDR width/height
    entries += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(d), offset)
    offset += len(d)
    blobs += d
open(out, "wb").write(header + entries + blobs)
