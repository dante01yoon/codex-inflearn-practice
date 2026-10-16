"""저장된 STEP에 관통 구멍을 추가하고 내보낸 STEP을 검증합니다."""
import argparse
import json
import math
from pathlib import Path
import cadquery as cq


def main():
    root = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=root / 'outputs/after/organizer.step')
    parser.add_argument('--out', type=Path, default=root / 'outputs/edited')
    parser.add_argument('--diameter', type=float, default=5.0)
    args = parser.parse_args()
    if not math.isfinite(args.diameter) or args.diameter <= 0:
        parser.error('--diameter must be a finite positive number')
    step_path = args.out / 'organizer.step'
    if step_path.resolve() == args.input.resolve():
        parser.error('--out must not overwrite the input STEP')

    original = cq.importers.importStep(str(args.input)).val()
    assert original.isValid() and len(original.Solids()) == 1
    bounds = original.BoundingBox()
    cutter = cq.Solid.makeCylinder(
        args.diameter / 2, bounds.zlen + 2,
        cq.Vector(0, -8, bounds.zmin - 1), cq.Vector(0, 0, 1),
    )
    edited = original.cut(cutter)
    assert edited.isValid() and len(edited.Solids()) == 1
    removed = original.Volume() - edited.Volume()
    expected = math.pi * (args.diameter / 2) ** 2 * bounds.zlen
    assert math.isclose(removed, expected, rel_tol=1e-8, abs_tol=1e-6)

    args.out.mkdir(parents=True, exist_ok=True)
    cq.exporters.export(edited, str(step_path))
    cq.exporters.export(edited, str(args.out / 'organizer.stl'))
    reopened = cq.importers.importStep(str(step_path)).val()
    bb = reopened.BoundingBox()
    assert reopened.isValid() and len(reopened.Solids()) == 1
    assert all(math.isclose(a, b, abs_tol=1e-6) for a, b in zip(
        (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax),
        (bounds.xmin, bounds.xmax, bounds.ymin, bounds.ymax, bounds.zmin, bounds.zmax),
    ))
    assert math.isclose(original.Volume() - reopened.Volume(), expected, abs_tol=1e-6)
    # Compare the saved solid with the original outside the requested cylinder.
    added_volume = reopened.cut(original).Volume()
    removed_outside_hole = original.cut(reopened).cut(cutter).Volume()
    assert added_volume < 1e-6 and removed_outside_hole < 1e-6
    for z in (bb.zmin + 1e-4, (bb.zmin + bb.zmax) / 2, bb.zmax - 1e-4):
        assert not reopened.isInside(cq.Vector(0, -8, z))

    report = {
        'result': 'PASS',
        'hole_center_mm': [0, -8],
        'diameter_mm': args.diameter,
        'dimensions_mm': [bb.xlen, bb.ylen, bb.zlen],
        'original_volume_mm3': original.Volume(),
        'edited_volume_mm3': reopened.Volume(),
        'removed_volume_mm3': removed,
        'cylinder_formula_volume_mm3': expected,
        'added_volume_mm3': added_volume,
        'removed_outside_hole_mm3': removed_outside_hole,
        'reopened_valid': reopened.isValid(),
        'solid_count': len(reopened.Solids()),
    }
    report_text = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    (args.out / 'measurements.json').write_text(report_text, encoding='utf-8')
    print(report_text, end='')


if __name__ == '__main__':
    main()
