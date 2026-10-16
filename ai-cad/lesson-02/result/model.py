"""SPEC.md의 케이블 정리대. 모든 치수는 mm 단위."""

import argparse
import math
from pathlib import Path

from smlibpy import Box, Cylinder, Z, render, show


def build(hole=6.0, thickness=3.0):
    """추가 가공 구멍 없이 케이블 정리대 Part를 반환한다."""
    hole, thickness = float(hole), float(thickness)
    if not math.isfinite(hole) or not 2 < hole < 18:
        raise ValueError("hole must be finite and between 2 and 18 mm")
    if not math.isfinite(thickness) or thickness <= 0:
        raise ValueError("thickness must be finite and positive")

    part = Box(80, 30, thickness).translate(z=thickness / 2)
    part = part.fillet(part.edges().parallel_to(Z), 2)
    cutter_height = thickness + 2
    for x in (-27, -9, 9, 27):
        cable = Cylinder(hole / 2, cutter_height).translate(
            x=x, z=thickness / 2
        )
        slot = Box(2, 15, cutter_height).translate(
            x=x, y=7.5, z=thickness / 2
        )
        part = part - cable - slot
    for x in (-34, 34):
        mount = Cylinder(3.5 / 2, cutter_height).translate(
            x=x, y=-9, z=thickness / 2
        )
        part = part - mount
    if not part.is_valid():
        raise RuntimeError("Generated CAD geometry is invalid")
    return part


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hole", type=float, default=6.0)
    parser.add_argument("--thickness", type=float, default=3.0)
    parser.add_argument("--out", type=Path, default=Path("outputs/before"))
    args = parser.parse_args()
    part = build(args.hole, args.thickness)
    args.out.mkdir(parents=True, exist_ok=True)
    part.export(str(args.out / "organizer.step"))
    part.export(str(args.out / "organizer.stl"))
    show(part, path=str(args.out / "viewer.html"), open_browser=False)
    render(part, path=str(args.out / "preview.png"), view="iso", size=(1200, 700))
    print(f"Generated STEP, STL, viewer.html, preview.png in {args.out}")


if __name__ == "__main__":
    main()
