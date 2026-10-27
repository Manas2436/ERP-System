"""Render the Student Management Mermaid ER blocks to clean SVG and PNG files.

Uses only the Mermaid source files as diagram input. The fixed layouts keep
this report-oriented module diagram readable and avoid depending on a browser.
Requires matplotlib, already available in the repository workspace runtime.
"""
from pathlib import Path
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "ER-Diagram"
EXPORTS = DOCS / "exports"
CARDINALITY = {
    "||--o{": "1 : 0..*",
    "||--o|": "1 : 0..1",
    "o|--o|": "0..1 : 0..1",
}


def parse_diagram(path):
    source = path.read_text(encoding="utf-8")
    match = re.search(r"```mermaid\s*(.*?)```", source, flags=re.S)
    if not match:
        raise ValueError(f"No Mermaid block in {path}")
    body = match.group(1)
    entities = {}
    for name, contents in re.findall(r"^\s{2}([A-Z][A-Z0-9_]*)\s*\{([^}]*)\}", body, re.M):
        entities[name] = [line.strip() for line in contents.splitlines() if line.strip()]
    relations = re.findall(
        r"^\s{2}([A-Z][A-Z0-9_]*)\s+([|o}{]+--[|o}{]+)\s+([A-Z][A-Z0-9_]*)\s*:\s*([\w]+)\s*$",
        body, re.M,
    )
    for left, _, right, _ in relations:
        entities.setdefault(left, [])
        entities.setdefault(right, [])
    # Mermaid permits a standalone entity declaration with no relationships.
    for name in re.findall(r"^\s{2}([A-Z][A-Z0-9_]*)\s*$", body, re.M):
        entities.setdefault(name, [])
    return entities, relations


OVERVIEW_POS = {
    "DEPARTMENT": (2.5, 12.5), "PROGRAM": (7.5, 12.5), "STUDENT": (12.5, 12.5),
    "STUDENT_PROFILE": (18.5, 14.8), "GUARDIAN": (18.5, 11.8), "ADMISSION": (24.5, 11.8),
    "COURSE": (2.5, 7.0), "COURSE_OFFERING": (13.5, 7.0), "ENROLLMENT": (19.0, 7.0),
    "ATTENDANCE": (24.5, 7.0), "ACADEMIC_YEAR": (2.5, 3.2), "SEMESTER": (7.5, 3.2),
    "STUDENT_PROFILE_AUDIT": (24.5, 3.2),
}

DETAIL_POS = {
    "DEPARTMENT": (2.5, 14.0), "PROGRAM": (7.5, 14.0), "STUDENT": (12.5, 14.0),
    "STUDENT_PROFILE": (18.0, 14.0), "GUARDIAN": (23.5, 14.0), "ADMISSION": (29.0, 14.0),
    "STUDENT_PROFILE_AUDIT": (34.0, 10.0), "COURSE": (7.5, 8.0),
    "COURSE_OFFERING": (13.0, 8.0), "ENROLLMENT": (19.0, 8.0), "ATTENDANCE": (25.0, 8.0),
    "ACADEMIC_YEAR": (7.5, 3.2), "SEMESTER": (13.0, 3.2),
    "FACULTY": (2.5, 3.2), "ROLE": (19.0, 3.2), "APP_USER": (29.0, 3.2),
}


def route_points(name, left, right, centers, dims):
    x1, y1 = centers[left]
    x2, y2 = centers[right]
    w1, h1 = dims[left]
    w2, h2 = dims[right]
    routes = {
        "overview": {
            ("DEPARTMENT", "COURSE"): [(2.5, 12.17), (2.5, 7.33)],
            ("STUDENT", "GUARDIAN"): [(14.275, 12.5), (16.725, 11.8)],
            ("STUDENT", "ADMISSION"): [(11.6, 12.17), (11.6, 9.5), (24.5, 9.5), (24.5, 11.47)],
            ("STUDENT", "ENROLLMENT"): [(13.4, 12.17), (13.4, 8.35), (19.0, 8.35), (19.0, 7.33)],
            ("SEMESTER", "COURSE_OFFERING"): [(7.5, 3.53), (13.5, 6.67)],
        },
        "detail": {
            ("DEPARTMENT", "FACULTY"): [(0.4, 14.0), (0.12, 14.0), (0.12, 3.2), (0.37, 3.2)],
            ("DEPARTMENT", "COURSE"): [(2.5, 13.07), (2.5, 10.2), (7.5, 10.2), (7.5, 9.31)],
            ("STUDENT", "GUARDIAN"): [(12.5, 15.44), (12.5, 16.75), (23.5, 16.75), (23.5, 15.18)],
            ("STUDENT", "ADMISSION"): [(12.5, 15.44), (12.5, 17.15), (29.0, 17.15), (29.0, 15.05)],
            ("STUDENT", "ENROLLMENT"): [(12.5, 12.56), (12.5, 10.35), (19.0, 10.35), (19.0, 9.18)],
            ("SEMESTER", "COURSE_OFFERING"): [(13.0, 4.26), (13.0, 7.07)],
            ("FACULTY", "APP_USER"): [(4.63, 3.2), (5.0, 5.5), (26.85, 5.5), (26.875, 5.25)],
            ("STUDENT", "APP_USER"): [(14.625, 14.0), (15.35, 14.0), (15.35, 6.0), (37.5, 6.0), (37.5, 3.2), (31.125, 3.2)],
        },
    }
    custom = routes[name].get((left, right))
    if custom:
        return custom
    if abs(x2 - x1) >= abs(y2 - y1):
        sx = x1 + (w1 / 2 if x2 > x1 else -w1 / 2)
        ex = x2 - (w2 / 2 if x2 > x1 else -w2 / 2)
        return [(sx, y1), (ex, y2)]
    sy = y1 + (h1 / 2 if y2 > y1 else -h1 / 2)
    ey = y2 - (h2 / 2 if y2 > y1 else -h2 / 2)
    return [(x1, sy), (x2, ey)]


def render(source_path, name, positions, detailed):
    entities, relations = parse_diagram(source_path)
    if set(positions) != set(entities):
        raise ValueError(f"Layout mismatch: missing={set(entities)-set(positions)}, extra={set(positions)-set(entities)}")
    dims = {}
    for entity, attrs in entities.items():
        height = 0.66 if not detailed else 0.58 + 0.255 * len(attrs)
        dims[entity] = (4.25 if detailed else 3.55, height)
    fig, ax = plt.subplots(figsize=(39 if detailed else 28, 19 if detailed else 16), facecolor="white")
    ax.set_facecolor("white")
    ax.set_xlim(0, 39 if detailed else 28)
    ax.set_ylim(0.4, 18.6 if detailed else 16.0)
    ax.axis("off")

    # Lines are drawn first, so all entity text remains crisp and unobscured.
    for ix, (left, glyph, right, label) in enumerate(relations):
        pts = route_points("detail" if detailed else "overview", left, right, positions, dims)
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color="#334155", lw=1.25 if not detailed else 0.95, zorder=1)
        middle = (len(pts) - 1) // 2
        a, b = pts[middle], pts[middle + 1]
        lx, ly = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if detailed and (left, right) == ("DEPARTMENT", "FACULTY"):
            lx, ly = 1.7, 8.7
        cardinality = CARDINALITY.get(glyph, glyph)
        ax.text(lx, ly + (0.13 if ix % 2 == 0 else -0.13), f"{cardinality}  {label.replace('_', ' ')}",
                ha="center", va="center", fontsize=8.3 if not detailed else 6.7, color="#1e293b",
                bbox=dict(facecolor="white", edgecolor="none", pad=1.1), zorder=2)

    for entity, attrs in entities.items():
        cx, cy = positions[entity]
        width, height = dims[entity]
        x, y = cx - width / 2, cy - height / 2
        box = FancyBboxPatch((x, y), width, height, boxstyle="round,pad=0.035,rounding_size=0.08",
                             edgecolor="#1f2937", facecolor="white", linewidth=1.25, zorder=3)
        ax.add_patch(box)
        if detailed:
            header_h = 0.42
            ax.add_patch(FancyBboxPatch((x, y + height - header_h), width, header_h,
                                        boxstyle="round,pad=0.035,rounding_size=0.08",
                                        edgecolor="none", facecolor="#e8eef5", linewidth=0, zorder=4))
            ax.plot([x, x + width], [y + height - header_h] * 2, color="#1f2937", lw=0.8, zorder=5)
            ax.text(cx, y + height - header_h / 2, entity.replace("_", " "), ha="center", va="center",
                    fontsize=8.5, fontweight="bold", color="#102a43", zorder=6)
            for i, attr in enumerate(attrs):
                yy = y + height - header_h - 0.12 - 0.255 * (i + 0.5)
                ax.text(x + 0.13, yy, attr, ha="left", va="center", fontsize=6.65, color="#172b4d", zorder=6)
        else:
            ax.text(cx, cy, entity.replace("_", " "), ha="center", va="center", fontsize=10.2,
                    fontweight="bold", color="#102a43", zorder=5)

    title = "STUDENT MANAGEMENT — DETAILED ENTITY RELATIONSHIP DIAGRAM" if detailed else "STUDENT MANAGEMENT — OVERVIEW ERD"
    ax.text((39 if detailed else 28) / 2, 18.25 if detailed else 15.45, title, ha="center", va="center",
            fontsize=15, fontweight="bold", color="#102a43")
    footer = "STUDENT_PROFILE_AUDIT.student_id has no declared FK; it is shown without a relationship." if detailed else "STUDENT_PROFILE_AUDIT is isolated: student_id is not a declared FK."
    ax.text((39 if detailed else 28) / 2, 0.72, footer, ha="center", va="center", fontsize=8.5, color="#475569")
    EXPORTS.mkdir(parents=True, exist_ok=True)
    svg_path = EXPORTS / f"{name}.svg"
    fig.savefig(svg_path, format="svg", facecolor="white", bbox_inches="tight", pad_inches=0.2)
    # Matplotlib emits harmless trailing spaces in SVG path data; strip them so
    # repository whitespace checks stay clean without changing the XML content.
    svg_path.write_text("\n".join(line.rstrip() for line in svg_path.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
    fig.savefig(EXPORTS / f"{name}.png", format="png", dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.2)
    plt.close(fig)
    print(f"{source_path.name}: {len(entities)} entities, {len(relations)} relationships")


if __name__ == "__main__":
    render(DOCS / "student-management-overview.md", "student-management-overview", OVERVIEW_POS, False)
    render(DOCS / "student-management.md", "student-management", DETAIL_POS, True)
