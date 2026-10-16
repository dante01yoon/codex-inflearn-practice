import argparse, json, math
from pathlib import Path
import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

p = argparse.ArgumentParser()
p.add_argument("--file", type=Path, required=True)
p.add_argument("--hole", type=float, required=True)
p.add_argument("--thickness", type=float, required=True)
p.add_argument("--report", type=Path, required=True)
a = p.parse_args()
s = cq.importers.importStep(str(a.file)).val()
bb = s.BoundingBox()
checks = {}


def check(k, v):
    checks[k] = bool(v)
    if not v:
        raise AssertionError(k)


check("valid_solid", s.isValid() and len(s.Solids()) == 1)
for k, v, e in [
    ("width", bb.xlen, 80),
    ("depth", bb.ylen, 30),
    ("thickness", bb.zlen, a.thickness),
    ("base_z", bb.zmin, 0),
]:
    check(k, math.isclose(v, e, abs_tol=1e-5))
c = []
for f in s.Faces():
    z = BRepAdaptor_Surface(f.wrapped)
    if z.GetType() == GeomAbs_Cylinder:
        cy = z.Cylinder()
        lo = cy.Location()
        c.append((lo.X(), lo.Y(), cy.Radius() * 2))
for x in [-27, -9, 9, 27]:
    check(
        "cable_" + str(x),
        any(
            abs(xx - x) < 1e-5 and abs(y) < 1e-5 and abs(d - a.hole) < 1e-5
            for xx, y, d in c
        ),
    )
for x in [-34, 34]:
    check(
        "mount_" + str(x),
        any(
            abs(xx - x) < 1e-5 and abs(y + 9) < 1e-5 and abs(d - 3.5) < 1e-5
            for xx, y, d in c
        ),
    )
for x in [-27, -9, 9, 27]:
    check(
        "slot_" + str(x),
        not s.isInside(cq.Vector(x, 10, a.thickness / 2))
        and s.isInside(cq.Vector(x - 1.1, 10, a.thickness / 2))
        and s.isInside(cq.Vector(x + 1.1, 10, a.thickness / 2)),
    )
check("no_unrequested_hole", s.isInside(cq.Vector(0, -8, a.thickness / 2)))
r = {
    "result": "PASS",
    "file": a.file.name,
    "dimensions_mm": [bb.xlen, bb.ylen, bb.zlen],
    "hole_mm": a.hole,
    "volume_mm3": s.Volume(),
    "checks": checks,
}
a.report.parent.mkdir(parents=True, exist_ok=True)
a.report.write_text(json.dumps(r, indent=2) + "\n")
print(json.dumps(r, indent=2))
