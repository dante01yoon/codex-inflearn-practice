# CAD API 빠른 참고
공식 문서: https://github.com/awv-informatik/smlibpy
Box(가로,세로,두께), Cylinder(반지름,높이), translate(x=,y=,z=), part - cutter.
세로모서리: part.edges().parallel_to(Z), 모서리둥글게: part.fillet(edges,반경).
저장: part.export("file.step"), part.export("file.stl").
show(part,path="viewer.html",open_browser=False). render(part,path="preview.png",view="iso",size=(1200,700)).
예제 단위는 mm. Box/Cylinder는 기본중심배치이므로바닥z=0 조건은z이동으로맞춥니다.
