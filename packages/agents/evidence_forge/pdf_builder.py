from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Table,
    TableStyle,
    Spacer,
    HRFlowable,
    KeepTogether,
)
from reportlab.lib import colors
from reportlab.platypus.flowables import BalancedColumns
import io
import datetime

# ── Brand palette ──────────────────────────────────────────────────────────────
NAVY       = colors.HexColor("#0a1628")
BLUE       = colors.HexColor("#0057ff")
LIGHT_BLUE = colors.HexColor("#e8f0ff")
ACCENT     = colors.HexColor("#00c2ff")
DARK_GRAY  = colors.HexColor("#1e293b")
MID_GRAY   = colors.HexColor("#64748b")
LIGHT_GRAY = colors.HexColor("#f1f5f9")
WHITE      = colors.white
RED        = colors.HexColor("#ef4444")
ORANGE     = colors.HexColor("#f97316")
GREEN      = colors.HexColor("#22c55e")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


def _severity_color(severity: str) -> colors.Color:
    s = severity.upper()
    if s == "P1":
        return RED
    if s == "P2":
        return ORANGE
    return GREEN


def _build_styles():
    base = getSampleStyleSheet()

    styles = {
        "cover_title": ParagraphStyle(
            "cover_title",
            fontName="Helvetica-Bold",
            fontSize=22,
            textColor=WHITE,
            leading=28,
            spaceAfter=4,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            fontName="Helvetica",
            fontSize=10,
            textColor=colors.HexColor("#a0b4d0"),
            leading=14,
            spaceAfter=2,
        ),
        "section_heading": ParagraphStyle(
            "section_heading",
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=NAVY,
            leading=16,
            spaceBefore=14,
            spaceAfter=4,
        ),
        "sub_heading": ParagraphStyle(
            "sub_heading",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=BLUE,
            leading=12,
            spaceBefore=6,
            spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "body",
            fontName="Helvetica",
            fontSize=8.5,
            textColor=DARK_GRAY,
            leading=13,
            spaceAfter=3,
        ),
        "small": ParagraphStyle(
            "small",
            fontName="Helvetica",
            fontSize=7.5,
            textColor=MID_GRAY,
            leading=11,
        ),
        "badge_p1": ParagraphStyle(
            "badge_p1",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName="Helvetica",
            fontSize=7,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
        ),
        "citation_article": ParagraphStyle(
            "citation_article",
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=BLUE,
            leading=12,
            spaceBefore=8,
            spaceAfter=2,
        ),
        "citation_text": ParagraphStyle(
            "citation_text",
            fontName="Helvetica-Oblique",
            fontSize=8,
            textColor=DARK_GRAY,
            leading=12,
            leftIndent=8,
            spaceAfter=2,
        ),
        "source": ParagraphStyle(
            "source",
            fontName="Helvetica",
            fontSize=7.5,
            textColor=MID_GRAY,
            leading=10,
            leftIndent=8,
        ),
    }
    return styles


def _header_banner(story, incident_id: str, severity: str, generated_at: str):
    """Full-width navy banner acting as a cover header."""
    sev_color = _severity_color(severity)
    sev_hex = sev_color.hexval() if hasattr(sev_color, "hexval") else "#ef4444"

    banner_data = [[
        Paragraph(
            f'<font color="white"><b>GradientGuard</b></font>'
            f'<font color="#00c2ff">  ·  DORA Incident Evidence Package</font>',
            ParagraphStyle("bt", fontName="Helvetica-Bold", fontSize=16,
                           textColor=WHITE, leading=20),
        ),
        Paragraph(
            f'<font color="{sev_hex}"><b>{severity}</b></font>',
            ParagraphStyle("sev", fontName="Helvetica-Bold", fontSize=22,
                           textColor=sev_color, alignment=TA_RIGHT, leading=26),
        ),
    ]]
    banner = Table(banner_data, colWidths=[PAGE_W - 2 * MARGIN - 50, 50])
    banner.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
        ("TOPPADDING",   (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
        ("LEFTPADDING",  (0, 0), (0, -1),  14),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 14),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(banner)

    # Meta row below banner
    meta_data = [[
        Paragraph(f"<b>Incident ID:</b> {incident_id}", ParagraphStyle(
            "m", fontName="Helvetica", fontSize=8, textColor=MID_GRAY, leading=11)),
        Paragraph(f"<b>Generated:</b> {generated_at}", ParagraphStyle(
            "m2", fontName="Helvetica", fontSize=8, textColor=MID_GRAY,
            leading=11, alignment=TA_RIGHT)),
    ]]
    meta = Table(meta_data, colWidths=[(PAGE_W - 2 * MARGIN) / 2] * 2)
    meta.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (0, -1),  14),
        ("RIGHTPADDING", (-1, 0), (-1, -1), 14),
    ]))
    story.append(meta)


def _section_divider(story, title: str, styles):
    story.append(Spacer(1, 6))
    story.append(HRFlowable(
        width="100%", thickness=1.5, color=BLUE,
        spaceAfter=4, spaceBefore=4,
    ))
    story.append(Paragraph(title, styles["section_heading"]))


def _summary_cards(story, incident_id: str, severity: str, incidents: list, styles):
    """3-column summary cards row."""
    sev_color = _severity_color(severity)

    def _card(label, value, value_color=NAVY):
        return [
            Paragraph(label, ParagraphStyle(
                "cl", fontName="Helvetica", fontSize=7.5, textColor=MID_GRAY, leading=10)),
            Paragraph(str(value), ParagraphStyle(
                "cv", fontName="Helvetica-Bold", fontSize=13,
                textColor=value_color, leading=16)),
        ]

    card_w = (PAGE_W - 2 * MARGIN - 6) / 3

    cards_data = [[
        Table([_card("SEVERITY LEVEL", severity, sev_color)],
              colWidths=[card_w - 16]),
        Table([_card("BREACHES DETECTED", len(incidents))],
              colWidths=[card_w - 16]),
        Table([_card("REPORT STATUS", "COMPLETE", GREEN)],
              colWidths=[card_w - 16]),
    ]]
    cards = Table(cards_data, colWidths=[card_w] * 3, hAlign="LEFT")
    cards.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("LINEBEFORE",    (1, 0), (2, -1), 1, colors.HexColor("#dde3ee")),
        ("ROUNDEDCORNERS", [4]),
    ]))
    story.append(cards)


def _incident_table(story, incidents: list, styles):
    if not incidents:
        story.append(Paragraph("No breach details recorded.", styles["body"]))
        return

    col_widths = [90, 110, 130, 70, 65]
    header = ["Type", "Resource", "DORA Article", "RTO/RPO", "Details"]
    tdata = [header]

    for inc in incidents:
        rto_rpo = []
        if inc.get("rto_breach"):
            rto_rpo.append("RTO ✗")
        if inc.get("rpo_breach"):
            rto_rpo.append("RPO ✗")
        tdata.append([
            str(inc.get("type", "")).replace("_", " ").title(),
            str(inc.get("resource_name", inc.get("resource_id", "—"))),
            str(inc.get("dora_article", "—")),
            ", ".join(rto_rpo) if rto_rpo else "—",
            str(inc.get("details", ""))[:60],
        ])

    t = Table(tdata, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("TOPPADDING",    (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        # Body rows
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_GRAY]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), DARK_GRAY),
        # Grid
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#dde3ee")),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)


def _timeline_table(story, timeline: list, styles):
    if not timeline:
        story.append(Paragraph("Timeline data unavailable for this incident.", styles["body"]))
        return

    col_widths = [110, 220, 80, 65]
    header = ["Timestamp", "Event", "System", "Impact"]
    tdata = [header]

    for entry in timeline:
        ts = str(entry.get("timestamp", ""))[:19].replace("T", " ")
        tdata.append([
            ts,
            str(entry.get("event", ""))[:120],
            str(entry.get("system", ""))[:30],
            str(entry.get("impact", ""))[:20],
        ])

    t = Table(tdata, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0), 8),
        ("TOPPADDING",    (0, 0), (-1, 0), 7),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7.5),
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT_BLUE]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), DARK_GRAY),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#dde3ee")),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(t)


def _citations_section(story, citations: list, styles):
    if not citations:
        story.append(Paragraph("No DORA citations retrieved.", styles["body"]))
        return

    for c in citations[:6]:
        article = c.get("article", "Unknown Article")
        text    = c.get("text", "")[:600]
        source  = c.get("source", "DORA Regulation (EU) 2022/2554")

        block_data = [[
            Paragraph(f"⚖ {article}", styles["citation_article"]),
        ], [
            Paragraph(f'"{text}"', styles["citation_text"]),
        ], [
            Paragraph(f"Source: {source}", styles["source"]),
        ]]
        block = Table(block_data, colWidths=[PAGE_W - 2 * MARGIN - 8])
        block.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (0, 0),   6),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
            ("LINEAFTER",     (0, 0), (0, -1), 3, BLUE),
            ("BOX",           (0, 0), (-1, -1), 0.4, colors.HexColor("#dde3ee")),
        ]))
        story.append(block)
        story.append(Spacer(1, 4))


def _attestation_box(story, styles):
    stamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    box_data = [[
        Paragraph(
            "<b>Attestation</b><br/><br/>"
            "This evidence package was automatically generated by <b>GradientGuard</b> "
            "running on <b>DigitalOcean Gradient™ AI Platform</b>.<br/><br/>"
            "It is provided for audit and regulatory purposes under "
            "<b>DORA Article 17</b> (ICT-related incident management) and "
            "<b>Article 11</b> (ICT business continuity).<br/><br/>"
            f"<font color='#64748b'>Digitally timestamped: {stamp}</font>",
            ParagraphStyle("att", fontName="Helvetica", fontSize=8.5,
                           textColor=DARK_GRAY, leading=14),
        )
    ]]
    box = Table(box_data, colWidths=[PAGE_W - 2 * MARGIN])
    box.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BLUE),
        ("TOPPADDING",    (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LEFTPADDING",   (0, 0), (-1, -1), 16),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 16),
        ("BOX",           (0, 0), (-1, -1), 1.5, BLUE),
    ]))
    story.append(box)


def build_evidence_pdf(
    incident_id: str,
    severity: str,
    timeline: list,
    citations: list,
    incidents: list,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
    )

    styles = _build_styles()
    story = []
    generated_at = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # ── Cover banner ──────────────────────────────────────────────────────────
    _header_banner(story, incident_id, severity, generated_at)
    story.append(Spacer(1, 10))

    # ── Summary cards ─────────────────────────────────────────────────────────
    _summary_cards(story, incident_id, severity, incidents, styles)
    story.append(Spacer(1, 6))

    # ── Executive Summary ─────────────────────────────────────────────────────
    _section_divider(story, "1  ·  Executive Summary", styles)
    story.append(Paragraph(
        f"This evidence package documents DORA compliance evidence for incident "
        f"<b>{incident_id}</b>. A total of <b>{len(incidents)} threshold breach(es)</b> "
        f"were detected with a severity of <b>{severity}</b>. "
        f"The package includes a chronological incident timeline, applicable DORA "
        f"regulation citations, and a full attestation for regulatory audit purposes.",
        styles["body"],
    ))

    # ── Incident Breaches ─────────────────────────────────────────────────────
    _section_divider(story, "2  ·  Detected Breaches", styles)
    _incident_table(story, incidents, styles)

    # ── Incident Timeline ─────────────────────────────────────────────────────
    _section_divider(story, "3  ·  Incident Timeline", styles)
    _timeline_table(story, timeline, styles)

    # ── DORA Citations ────────────────────────────────────────────────────────
    _section_divider(story, "4  ·  Applicable DORA Regulation Citations", styles)
    _citations_section(story, citations, styles)

    # ── Attestation ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 12))
    _attestation_box(story, styles)

    doc.build(story)
    return buf.getvalue()
