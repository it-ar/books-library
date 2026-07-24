#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
أداة تحويل ملف إكسل مكتبة الكتب إلى ملفات بيانات يستخدمها موقع البحث.

الاستخدام:
    python3 tools/convert_excel.py "مسار/ملف.xlsx"

المخرجات:
    data/books.json      بيانات الكتب بصيغة JSON
    assets/books-data.js  نفس البيانات كملف JavaScript (window.BOOKS)
                          يسمح بفتح الصفحة مباشرة بدون خادم ويب.

بنية الإكسل المتوقعة:
    - كل ورقة (Sheet) تمثل تصنيفًا، اسم الورقة = اسم التصنيف.
    - الأعمدة عادةً: اسم الكتاب | المؤلف | عدد النسخ | رقم الصندوق
    - ورقة "اصدارات الهيئة" لها بنية خاصة (نوع | اسم | سنة | عدد | صندوق).
    - ورقة "المكتبة شاملة..." يتم تجاهلها لأنها تجميع مكرر للتصنيفات.
"""

import sys
import json
import os
import re

try:
    import openpyxl
except ImportError:
    sys.exit("يلزم تثبيت openpyxl:  pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# أوراق يتم تجاهلها (تجميعات / مكررة)
SKIP_SHEETS = {"المكتبة شاملة بدون الهيئة"}
# الورقة الخاصة بإصدارات الهيئة تُعالج بشكل منفصل
HAY_SHEET = "اصدارات الهيئة"

# قيم تدل على أنها صف عناوين وليست كتابًا
HEADER_TITLES = {
    "اسم الكتاب", "الكتاب", "عمود1", "عمود2", "عمود3", "عمود4",
    "التنمية البشرية",
}
HEADER_AUTHORS = {"المؤلف", "اسم المؤلف", "عمود2"}
HEADER_COPIES = {"النسخ", "عدد النسخ", "عمود3"}


def clean(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s


def to_int(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
        if f == int(f):
            return int(f)
        return None
    except (ValueError, TypeError):
        return None


def is_section_header(title, author, copies, box):
    """صف عنوان قسم: العنوان فقط ممتلئ وباقي الخلايا فارغة."""
    return title and not author and copies is None and not box


def looks_like_header_row(title, author, copies):
    t = clean(title)
    a = clean(author)
    c = clean(copies)
    if t in HEADER_TITLES:
        return True
    if a in HEADER_AUTHORS and (c in HEADER_COPIES or c == ""):
        return True
    if c in HEADER_COPIES and a in HEADER_AUTHORS:
        return True
    return False


def parse_category_sheet(ws):
    """يقرأ ورقة تصنيف عادية ويعيد قائمة كتب."""
    books = []
    category = ws.title.strip()
    for row in ws.iter_rows(values_only=True):
        if not row:
            continue
        # الأعمدة: 0=العنوان 1=المؤلف 2=النسخ 3=الصندوق
        title = clean(row[0]) if len(row) > 0 else ""
        author = clean(row[1]) if len(row) > 1 else ""
        copies_raw = row[2] if len(row) > 2 else None
        box_raw = row[3] if len(row) > 3 else None

        if not title:
            continue
        if looks_like_header_row(title, author, copies_raw):
            continue

        copies = to_int(copies_raw)
        box = clean(box_raw)

        # تخطي صفوف عناوين الأقسام (عنوان فقط بلا مؤلف ولا نسخ ولا صندوق)
        if is_section_header(title, author, copies, box):
            continue

        books.append({
            "title": title,
            "author": author,
            "category": category,
            "copies": copies,
            "box": box,
            "year": None,
            "type": "",
        })
    return books


def parse_hay_sheet(ws):
    """ورقة إصدارات الهيئة: أعمدة تبدأ من الفهرس 11."""
    books = []
    category = "إصدارات الهيئة"
    # الأعمدة: 11=النوع 12=الاسم 13=سنة الإصدار 14=العدد 15=الصندوق
    for row in ws.iter_rows(values_only=True):
        if len(row) < 13:
            continue
        btype = clean(row[11]) if len(row) > 11 else ""
        title = clean(row[12]) if len(row) > 12 else ""
        year = to_int(row[13]) if len(row) > 13 else None
        copies = to_int(row[14]) if len(row) > 14 else None
        box = clean(row[15]) if len(row) > 15 else ""

        if not title or title == "اسم الكتاب":
            continue
        if btype in ("عمود1", "تصنيف المؤلف"):
            continue
        if title == "إصدارات كتب هيئة حقوق الانسان":
            continue

        books.append({
            "title": title,
            "author": "هيئة حقوق الإنسان",
            "category": category,
            "copies": copies,
            "box": box,
            "year": year,
            "type": btype,
        })
    return books


def main():
    if len(sys.argv) < 2:
        sys.exit("الاستخدام: python3 tools/convert_excel.py <ملف.xlsx>")
    path = sys.argv[1]
    wb = openpyxl.load_workbook(path, data_only=True)

    all_books = []
    for ws in wb.worksheets:
        name = ws.title.strip()
        if name in SKIP_SHEETS:
            continue
        if name == HAY_SHEET:
            all_books.extend(parse_hay_sheet(ws))
        else:
            all_books.extend(parse_category_sheet(ws))

    # ترقيم فريد
    for i, b in enumerate(all_books, 1):
        b["id"] = i

    # ملخص التصنيفات
    cats = {}
    for b in all_books:
        cats[b["category"]] = cats.get(b["category"], 0) + 1

    payload = {
        "generatedFrom": os.path.basename(path),
        "count": len(all_books),
        "categories": cats,
        "books": all_books,
    }

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)

    json_path = os.path.join(ROOT, "data", "books.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    js_path = os.path.join(ROOT, "assets", "books-data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("// ملف مُولّد آليًا بواسطة tools/convert_excel.py — لا تعدّله يدويًا\n")
        f.write("window.BOOKS_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")

    print("تم إنشاء البيانات بنجاح")
    print("إجمالي الكتب:", len(all_books))
    print("عدد التصنيفات:", len(cats))
    for c, n in sorted(cats.items(), key=lambda x: -x[1]):
        print(f"  {c}: {n}")
    print("\nالملفات:")
    print(" -", json_path)
    print(" -", js_path)


if __name__ == "__main__":
    main()
