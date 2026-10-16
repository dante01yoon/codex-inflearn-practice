"""3강 시작: STEP을 읽고 치수 확인. 추가 가공은 직접 구현합니다."""
from pathlib import Path
import cadquery as cq
p=Path(__file__).resolve().parent/'outputs/after/organizer.step'
s=cq.importers.importStep(str(p)).val()
b=s.BoundingBox()
print('재열기:',s.isValid(),[b.xlen,b.ylen,b.zlen])
