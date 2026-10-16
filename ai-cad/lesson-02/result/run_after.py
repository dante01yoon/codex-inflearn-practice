"""Generate and independently validate the 8 mm / 5 mm organizer."""

import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import cadquery as cq
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs/after"
BEFORE = ROOT / "outputs/before"


def hashes():
    return {
        str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(BEFORE.rglob("*")) if p.is_file()
    }


def measure(path):
    shape = cq.importers.importStep(str(path)).val()
    bb = shape.BoundingBox()
    cylinders = set()
    for face in shape.Faces():
        surface = BRepAdaptor_Surface(face.wrapped)
        if surface.GetType() == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            loc = cylinder.Location()
            cylinders.add(tuple(round(v, 6) for v in
                                (loc.X(), loc.Y(), cylinder.Radius() * 2)))
    slots = []
    for x in (-27, -9, 9, 27):
        walls = []
        for side in (-1, 1):
            target = x + side
            matches = [f.BoundingBox() for f in shape.Faces()
                       if abs(f.BoundingBox().xmin - target) < 1e-5
                       and abs(f.BoundingBox().xmax - target) < 1e-5
                       and abs(f.BoundingBox().ymax - 15) < 1e-5
                       and f.BoundingBox().ymin > 0]
            if len(matches) != 1:
                raise AssertionError(f"Slot wall missing at x={target}")
            walls.append(matches[0].xmin)
        slots.append(round(walls[1] - walls[0], 6))
    return {
        "dimensions_mm": [bb.xlen, bb.ylen, bb.zlen],
        "base_z_mm": bb.zmin,
        "cylinders_xy_diameter_mm": sorted(cylinders),
        "slot_widths_mm": slots,
    }


def main():
    original = hashes()
    if not original:
        raise RuntimeError("Missing before files")
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with (OUT / "generation.log").open("w", encoding="utf-8") as log:
            subprocess.run(
                [sys.executable, "-X", "utf8", "model.py", "--hole", "8",
                 "--thickness", "5", "--out", "outputs/after"],
                cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True,
            )
        subprocess.run(
            [sys.executable, "-X", "utf8", "verify_one.py", "--file",
             "outputs/after/organizer.step", "--hole", "8", "--thickness",
             "5", "--report", "outputs/after/verified.json"],
            cwd=ROOT, check=True,
        )
        before = measure(BEFORE / "organizer.step")
        after = measure(OUT / "organizer.step")
        assert math.isclose(before["base_z_mm"], after["base_z_mm"], abs_tol=1e-5)
        assert before["slot_widths_mm"] == after["slot_widths_mm"]
        for old, new in zip(before["dimensions_mm"][:2], after["dimensions_mm"][:2]):
            assert math.isclose(old, new, abs_tol=1e-5)
        expected = sorted((x, y, 8.0 if y == 0 and x in (-27, -9, 9, 27) else d)
                          for x, y, d in before["cylinders_xy_diameter_mm"])
        assert expected == after["cylinders_xy_diameter_mm"]
        assert hashes() == original, "Before files changed"
        report = {"result": "PASS", "before_preserved": True,
                  "before": before, "after": after}
        (OUT / "comparison.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        if hashes() != original:
            raise RuntimeError("Before preservation check failed")


if __name__ == "__main__":
    main()
