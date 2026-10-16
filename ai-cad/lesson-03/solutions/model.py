"""Parametric SMLib cable organizer. Dimensions are millimetres."""

import argparse
import json
from pathlib import Path

from smlibpy import Box, Cylinder, Z, show, render


def vector(v):
    return [float(v.x), float(v.y), float(v.z)]


def build(hole=6.0, thickness=3.0):
    if not 2 < hole <= 16 or thickness <= 0:
        raise ValueError("Require 2 < cable diameter <= 16 and thickness > 0")
    part = Box(80, 30, thickness).translate(z=thickness / 2)
    part = part.fillet(part.edges().parallel_to(Z), 2)
    # Extend all cutters beyond both Z faces for unambiguous through cuts.
    cutter_height = thickness + 2
    for x in (-27, -9, 9, 27):
        bore = Cylinder(hole / 2, cutter_height).translate(x=x, z=thickness / 2)
        slot = Box(2, 15, cutter_height).translate(x=x, y=7.5, z=thickness / 2)
        part = part - bore
        part = part - slot
    for x in (-34, 34):
        part = part - Cylinder(1.75, cutter_height).translate(
            x=x, y=-9, z=thickness / 2
        )
    return part


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hole", type=float, default=6, help="Cable hole DIAMETER in mm"
    )
    parser.add_argument(
        "--thickness", type=float, default=3, help="Plate thickness in mm"
    )
    parser.add_argument("--out", type=Path, default=Path("outputs/before"))
    args = parser.parse_args()
    out = args.out.resolve()
    if not out.is_relative_to(Path(__file__).resolve().parent):
        parser.error("--out must be inside this project directory")
    out.mkdir(parents=True, exist_ok=True)
    part = build(args.hole, args.thickness)
    if not part.is_valid():
        raise RuntimeError("SMLib model is invalid")
    part.export(str(out / "organizer.step"))
    part.export(str(out / "organizer.stl"))
    show(
        part,
        title=f"Cable organizer: diameter {args.hole:g}, thickness {args.thickness:g} mm",
        path=str(out / "viewer.html"),
        open_browser=False,
    )
    render(part, path=str(out / "preview.png"), view="iso", size=(1200, 700))
    bounds = part.bbox()
    cylinders = []
    for face in part.faces().cylinders():
        fb = face.bbox()
        cylinders.append(
            {
                "radius_mm": float(face.radius),
                "area_mm2": float(face.area),
                "bbox_min_mm": vector(fb.min),
                "bbox_max_mm": vector(fb.max),
            }
        )
    measurements = {
        "kernel": "smlibpy 0.3.3",
        "units": "mm",
        "requested_parameters": {
            "hole_diameter": args.hole,
            "thickness": args.thickness,
        },
        "bbox": {
            "min": vector(bounds.min),
            "max": vector(bounds.max),
            "size": vector(bounds.size),
        },
        "volume_mm3": float(part.volume),
        "is_valid": bool(part.is_valid()),
        "cylinder_faces": cylinders,
    }
    (out / "measurements.json").write_text(json.dumps(measurements, indent=2) + "\n")
    print(json.dumps({"output": str(out), **measurements}, indent=2))


if __name__ == "__main__":
    main()
