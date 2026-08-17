#!/usr/bin/env python3
"""Import locally saved 폐기물처리기사 PDFs into static quiz data."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import unicodedata
from pathlib import Path

import pdfplumber


CHOICE_MARKS = "①②③④❶❷❸❹"
FILLED_MARKS = "❶❷❸❹"
MARK_TO_INDEX = {mark: index % 4 for index, mark in enumerate(CHOICE_MARKS)}

EXAM_LABELS = {
    "20150531": "2015년 2회",
    "20150919": "2015년 4회",
    "20160306": "2016년 1회",
    "20160508": "2016년 2회",
    "20161001": "2016년 4회",
    "20170305": "2017년 1회",
    "20170507": "2017년 2회",
    "20170923": "2017년 4회",
    "20180304": "2018년 1회",
    "20180428": "2018년 2회",
    "20180915": "2018년 4회",
    "20190303": "2019년 1회",
    "20190427": "2019년 2회",
    "20190921": "2019년 4회",
    "20200606": "2020년 1·2회",
    "20200822": "2020년 3회",
    "20200926": "2020년 4회",
    "20210307": "2021년 1회",
    "20210515": "2021년 2회",
    "20210912": "2021년 4회",
    "20220305": "2022년 1회",
    "20220424": "2022년 2회",
}

TOPIC_RULES = [
    ("계산형", r"(?:계산|구하|얼마|몇\s|kg|mg|ppm|m3|m³|ton|kcal|mol|%|비율|농도|함수율|발열량|부피|질량|유량|속도)"),
    ("수집·운반", r"수거|수집|운반|수송|적환|차량|관로"),
    ("파쇄·선별", r"파쇄|분쇄|선별|스크린|트롬멜|자력"),
    ("매립", r"매립|침출수|차수|복토|매립지"),
    ("소각·연소", r"소각|연소|화격자|소각로|공기비|배기가스"),
    ("열분해·열회수", r"열분해|열회수|발열량|보일러|열교환"),
    ("퇴비화", r"퇴비|호기성|미생물|생물학적"),
    ("슬러지·소화", r"슬러지|소화조|혐기성|분뇨"),
    ("고형화", r"고형화|시멘트|용융"),
    ("재활용", r"재활용|자원화|연료화|사료화"),
    ("분석·측정", r"분석|측정|시험방법|흡광|크로마토|시료|용출|전처리"),
    ("법령·기준", r"법|시행령|시행규칙|환경부령|허가|신고|과태료|과징금|기준"),
]

QUESTION_OVERRIDES = {
    "20150531-024": {
        "text": "유기물(C6H12O6) 8 kg을 혐기성으로 완전 분해할 때 생성될 수 있는 이론적 메탄의 양(Sm3)은?",
    },
    "20150531-026": {
        "choices": ["약 634 m2", "약 784 m2", "약 854 m2", "약 964 m2"],
    },
    "20150531-082": {
        "choices": ["3300 m2 이상", "5500 m2 이상", "10000 m2 이상", "30000 m2 이상"],
    },
    "20150919-025": {
        "text": "포도당(C6H12O6)으로 구성된 유기물 3 kg이 혐기성 미생물에 의해 완전히 분해되어 생성되는 메탄의 용적(Sm3)은?",
    },
    "20160306-043": {
        "choices": ["약 2.2 × 104", "약 4.4 × 104", "약 6.6 × 104", "약 8.8 × 104"],
    },
    "20160306-058": {
        "choices": ["7.5 Sm3/kg", "9.5 Sm3/kg", "11.5 Sm3/kg", "13.5 Sm3/kg"],
    },
    "20161001-034": {
        "choices": ["Al2O3", "V2O5", "TiO2", "Pd"],
    },
    "20190303-021": {
        "choices": ["Al2O3", "V2O5", "TiO2", "Pd"],
    },
    "20190427-024": {
        "text": "유기물(C6H12O6) 0.1 ton을 혐기성 소화할 때 생성될 수 있는 최대 메탄의 양(kg)은?",
    },
    "20190427-076": {
        "text": "용출액 중의 PCBs 시험방법(기체크로마토그래피법)을 설명한 것으로 틀린 것은?",
        "choices": [
            "용출액 중의 PCBs를 헥산으로 추출한다.",
            "전자포획형 검출기(ECD)를 사용한다.",
            "정제는 활성탄칼럼을 사용한다.",
            "용출용액의 정량한계는 0.0005mg/L 이다.",
        ],
    },
    "20200822-030": {
        "choices": ["2SiO2·Fe2O3", "3CaO·SiO2", "2CaO·MgO", "3CaO·Fe2O3"],
    },
    "20200926-022": {
        "text": "유기물(C6H12O6)을 혐기성(피산소성) 소화시킬 때 반응에 대한 설명으로 옳지 않은 것은?",
    },
    "20210912-029": {
        "text": "유기물(C6H12O6) 0.1 ton을 혐기성 소화할 때 생성될 수 있는 최대 메탄의 양(kg)은?",
    },
    "20210912-069": {
        "choices": [
            "끓는점이 낮거나 비극성 유기화합물들이 함께 추출되어 간섭현상이 일어난다.",
            "시료 중에 트리클로로에틸렌(C2HCl3)의 정량한계는 0.008mg/L, 테트라클로로에틸렌(C2Cl4)의 정량한계는 0.002mg/L이다.",
            "디클로로메탄과 같은 휘발성 유기물은 보관이나 운반 중에 격막(septum)을 통해 시료 안으로 확산되어 시료를 오염시킬 수 있으므로 현장 바탕시료로서 이를 점검하여야 한다.",
            "디클로로메탄과 같이 머무름 시간이 짧은 화합물은 용매의 피크와 겹쳐 분석을 방해할 수 있다.",
        ],
    },
    "20220424-030": {
        "choices": ["4.0×10-8", "0.96×10-8", "0.64×10-8", "0.25×10-8"],
    },
}


def subject_for(number: int) -> str:
    if number <= 20:
        return "폐기물 개론"
    if number <= 40:
        return "폐기물 처리 기술"
    if number <= 60:
        return "폐기물 소각 및 열회수"
    if number <= 80:
        return "폐기물 공정시험기준"
    return "폐기물 관계 법규"


def clean_text(value: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in value.splitlines()]
    return re.sub(r"\s+", " ", " ".join(line for line in lines if line)).strip()


def extract_region_text(
    pdf_path: Path,
    page_number: int,
    box: tuple[float, float, float, float],
) -> str:
    """Extract a page region while preserving inline chemical subscripts."""
    x0, y0, x1, y1 = box
    result = subprocess.run(
        [
            "pdftotext",
            "-layout",
            "-r",
            "72",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-x",
            str(round(x0)),
            "-y",
            str(round(y0)),
            "-W",
            str(round(x1 - x0)),
            "-H",
            str(round(y1 - y0)),
            str(pdf_path),
            "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.replace("\f", "")


def labels_for(subject: str, text: str) -> list[str]:
    labels = [label for label, pattern in TOPIC_RULES if re.search(pattern, text, re.I)]
    if subject == "폐기물 관계 법규" and "법령·기준" not in labels:
        labels.append("법령·기준")
    if subject == "폐기물 공정시험기준" and "분석·측정" not in labels:
        labels.append("분석·측정")
    return labels[:3] or ["개념형"]


def extract_visuals(pdf_path: Path, date: str, output: Path) -> dict[int, list[str]]:
    visuals: dict[int, list[str]] = {}
    last_question = 0

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for side, bounds in enumerate(((0, page.width / 2), (page.width / 2, page.width))):
                x_min, x_max = bounds
                words = page.extract_words(x_tolerance=2, y_tolerance=3)
                starts = []
                for word in words:
                    if not (x_min <= word["x0"] < x_max):
                        continue
                    match = re.fullmatch(r"(\d{1,3})\.", word["text"])
                    if match and 1 <= int(match.group(1)) <= 100:
                        starts.append((word["top"], int(match.group(1))))
                starts.sort()

                side_images = [
                    image
                    for image in page.images
                    if x_min <= (image["x0"] + image["x1"]) / 2 < x_max
                    and 65 <= image["top"] <= page.height - 32
                ]
                for image in sorted(side_images, key=lambda item: item["top"]):
                    preceding = [number for top, number in starts if top <= image["top"]]
                    number = preceding[-1] if preceding else last_question
                    if not number:
                        continue
                    index = len(visuals.get(number, [])) + 1
                    name = f"{date}-{number:03d}-{index}.png"
                    crop = (
                        max(x_min, image["x0"] - 4),
                        max(65, image["top"] - 4),
                        min(x_max, image["x1"] + 4),
                        min(page.height - 32, image["bottom"] + 4),
                    )
                    page.crop(crop).to_image(resolution=180).save(output / name)
                    visuals.setdefault(number, []).append(f"/question-images/{name}")

                if starts:
                    last_question = starts[-1][1]
    return visuals


def extract_exam(pdf_path: Path, date: str, visuals: dict[int, list[str]]) -> list[dict]:
    chunks: list[str] = []
    page_offsets: list[tuple[int, int]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            boxes = [
                (0, 65, page.width / 2, page.height - 32),
                (page.width / 2, 65, page.width, page.height - 32),
            ]
            for box in boxes:
                page_offsets.append((sum(len(chunk) + 1 for chunk in chunks), page_number))
                chunks.append(extract_region_text(pdf_path, page_number, box))

    corpus = "\n".join(chunks)
    matches = list(re.finditer(r"(?m)^\s*(\d{1,3})\.\s", corpus))
    questions: list[dict] = []

    for index, match in enumerate(matches):
        number = int(match.group(1))
        block_end = matches[index + 1].start() if index + 1 < len(matches) else len(corpus)
        block = corpus[match.end() : block_end]
        block = re.split(r"\n\s*(?:전자문제집|\d과목\s*:)", block, maxsplit=1)[0]
        choice_matches = list(re.finditer(f"[{CHOICE_MARKS}]", block))[:4]

        if len(choice_matches) != 4:
            raise ValueError(f"{date} {number}번: 선택지 {len(choice_matches)}개")
        order = [MARK_TO_INDEX[item.group()] for item in choice_matches]
        if order != [0, 1, 2, 3]:
            raise ValueError(f"{date} {number}번: 선택지 순서 오류 {order}")

        answer_marks = [item.group() for item in choice_matches if item.group() in FILLED_MARKS]
        if len(answer_marks) != 1:
            raise ValueError(f"{date} {number}번: 정답 표시 {len(answer_marks)}개")

        text = clean_text(block[: choice_matches[0].start()])
        choices = []
        for choice_index, choice_match in enumerate(choice_matches):
            end = (
                choice_matches[choice_index + 1].start()
                if choice_index + 1 < len(choice_matches)
                else len(block)
            )
            choice_text = clean_text(block[choice_match.end() : end])
            choices.append(choice_text or f"원문의 {CHOICE_MARKS[choice_index]}번 식")

        page_number = max(
            page for offset, page in page_offsets if offset <= match.start()
        )
        subject = subject_for(number)
        labels = labels_for(subject, f"{text} {' '.join(choices)}")
        question_id = f"{date}-{number:03d}"
        question = {
            "id": question_id,
            "number": number,
            "subject": subject,
            "labels": labels,
            "text": text,
            "choices": choices,
            "answer": MARK_TO_INDEX[answer_marks[0]],
            "explanation": None,
            "keyPoint": " · ".join(labels),
            "sourcePage": page_number,
            "visuals": visuals.get(number, []),
        }
        question.update(QUESTION_OVERRIDES.get(question_id, {}))
        questions.append(question)

    numbers = [question["number"] for question in questions]
    if numbers != list(range(1, 101)):
        raise ValueError(f"{date}: 문항 번호 누락 또는 순서 오류")
    return questions


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source_files = sorted(args.source.glob("*.pdf"))
    grouped: dict[str, dict[str, Path]] = {}
    for path in source_files:
        name = unicodedata.normalize("NFC", path.name)
        date_match = re.search(r"(\d{8})", name)
        if not date_match:
            continue
        role = "teacher" if "교사용" in name else "student" if "학생용" in name else None
        if role:
            grouped.setdefault(date_match.group(1), {})[role] = path

    if sorted(grouped) != sorted(EXAM_LABELS):
        raise ValueError("예상 회차와 PDF 회차가 일치하지 않습니다.")
    if any(set(files) != {"teacher", "student"} for files in grouped.values()):
        raise ValueError("모든 회차에 교사용·학생용 PDF가 한 쌍씩 있어야 합니다.")

    data_dir = args.output / "data" / "exams"
    image_dir = args.output / "question-images"
    data_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)
    manifest = []

    for date in sorted(grouped, reverse=True):
        files = grouped[date]
        visuals = extract_visuals(files["student"], date, image_dir)
        questions = extract_exam(files["teacher"], date, visuals)
        payload = {
            "date": date,
            "label": EXAM_LABELS[date],
            "questions": questions,
        }
        (data_dir / f"{date}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        manifest.append(
            {
                "date": date,
                "label": EXAM_LABELS[date],
                "count": len(questions),
                "dataUrl": f"/data/exams/{date}.json",
            }
        )
        print(f"{date}: {len(questions)}문제")

    (data_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"완료: {len(manifest)}회차, {sum(item['count'] for item in manifest)}문제")


if __name__ == "__main__":
    main()
