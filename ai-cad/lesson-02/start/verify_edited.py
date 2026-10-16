"""Independently inspect original and added hole locations after STEP export."""

from pathlib import Path
import argparse, json, math
import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder

p = argparse.ArgumentParser()
p.add_argument("--file", type=Path, required=True)
p.add_argument("--diameter", type=float, required=True)
p.add_argument("--report", type=Path, required=True)
a = p.parse_args()
s = cq.importers.importStep(str(a.file)).val()
bb = s.BoundingBox()
cy = set()
checks = {}
for f in s.Faces():
    b = BRepAdaptor_Surface(f.wrapped)
    if b.GetType() == GeomAbs_Cylinder:
        c = b.Cylinder()
        l = c.Location()
        cy.add((round(l.X(), 5), round(l.Y(), 5), round(c.Radius() * 2, 5)))


def check(k, v):
    checks[k] = bool(v)
    if not v:
        raise AssertionError(k)


check("normal_one_solid", s.isValid() and len(s.Solids()) == 1)
check(
    "outer_dimensions",
    all(
        math.isclose(x, y, abs_tol=1e-5)
        for x, y in zip([bb.xlen, bb.ylen, bb.zlen], [80, 30, 5])
    ),
)
check(
    "four_cables_unchanged", all((x, 0.0, 8.0) in cy for x in [-27.0, -9.0, 9.0, 27.0])
)
check("two_mounts_unchanged", all((x, -9.0, 3.5) in cy for x in [-34.0, 34.0]))
check("new_hole_exact_location", (0.0, -8.0, a.diameter) in cy)
check("new_hole_empty", not s.isInside(cq.Vector(0, -8, 2.5)))
check(
    "surrounding_material_preserved",
    s.isInside(cq.Vector(a.diameter / 2 + 0.15, -8, 2.5)),
)
r = {
    "result": "PASS",
    "added_hole_mm": a.diameter,
    "checks": checks,
    "volume_mm3": s.Volume(),
}
a.report.parent.mkdir(exist_ok=True, parents=True)
a.report.write_text(json.dumps(r, indent=2) + "\n")
print(json.dumps(r, indent=2))
