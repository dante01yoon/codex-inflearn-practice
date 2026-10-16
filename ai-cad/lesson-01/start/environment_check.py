import sys, importlib.metadata as m
print('Python',sys.version.split()[0])
for p in ['smlibpy','cadquery']:
 print(p,m.version(p))
from smlibpy import Box
import cadquery
assert Box(1,1,1).is_valid()
print('준비 완료: CAD 기하 계산 가능')
