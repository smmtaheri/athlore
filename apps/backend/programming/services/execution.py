"""One per-set execution projection for grouped timers, duration and delivery."""

import re
from collections import defaultdict


def rest_seconds(item):
    text = str(item.get("rest", "")).strip()
    clock = re.fullmatch(r"(\d{1,2}):(\d{1,2})", text)
    if clock:
        return int(clock[1]) * 60 + int(clock[2])
    values = re.findall(r"\d+", text)
    amount = int(values[0]) if values else 0
    return amount * 60 if re.search(r"دقیقه|min(?:ute)?s?", text, re.I) else amount


def compile_execution(days):
    for day in days:
        groups = defaultdict(list)
        for item in day.get("exercises", []):
            key = item.get("trainingGroupId") or item.get("supersetGroupId")
            if key:
                groups[key].append(item)
            item["executionPlan"] = {
                "version": 1,
                "pairedRounds": 0,
                "soloSets": int(item["sets"]),
                "sets": [
                    {"setIndex": index, "phase": "solo", "restSeconds": rest_seconds(item)}
                    for index in range(int(item["sets"]))
                ],
            }
        for key, members in groups.items():
            if len(members) < 2:
                continue
            rounds = min(int(item["sets"]) for item in members)
            after = max(
                int(item["supersetRestAfterSeconds"])
                if item.get("supersetRestAfterSeconds") is not None
                else rest_seconds(item)
                for item in members
            )
            between = max(int(item.get("supersetRestBetweenSeconds") or 0) for item in members)
            for index, item in enumerate(members):
                plan = item["executionPlan"]
                plan.update(groupId=key, pairedRounds=rounds, soloSets=int(item["sets"]) - rounds)
                for row in plan["sets"][:rounds]:
                    next_item = members[index + 1] if index < len(members) - 1 else members[0]
                    if index == len(members) - 1 and row["setIndex"] == rounds - 1:
                        next_item = next(
                            (member for member in members if int(member["sets"]) > rounds), None
                        )
                    row.update(
                        phase="paired",
                        restSeconds=after if index == len(members) - 1 else between,
                        nextExerciseId=next_item["id"] if next_item else None,
                    )
        for item in day.get("exercises", []):
            prescription = item.get("prescription") or {}
            if prescription.get("version") == 2:
                saved_sets = prescription.get("set_plan") or []
                prescription["set_plan"] = [
                    {
                        **(
                            saved_sets[row["setIndex"]]
                            if row["setIndex"] < len(saved_sets)
                            and isinstance(saved_sets[row["setIndex"]], dict)
                            else {}
                        ),
                        "set": row["setIndex"] + 1,
                        "reps_text": (
                            saved_sets[row["setIndex"]].get("reps_text")
                            or item["reps"]
                            if row["setIndex"] < len(saved_sets)
                            and isinstance(saved_sets[row["setIndex"]], dict)
                            else item["reps"]
                        ),
                        "rest": (
                            saved_sets[row["setIndex"]].get("rest")
                            if row["phase"] == "solo"
                            and row["setIndex"] < len(saved_sets)
                            and isinstance(saved_sets[row["setIndex"]], dict)
                            and saved_sets[row["setIndex"]].get("rest")
                            else f"{row['restSeconds']} ثانیه"
                        ),
                        "effort": (
                            saved_sets[row["setIndex"]].get("effort", item.get("rpe", ""))
                            if row["setIndex"] < len(saved_sets)
                            and isinstance(saved_sets[row["setIndex"]], dict)
                            else item.get("rpe", "")
                        ),
                    }
                    for row in item["executionPlan"]["sets"]
                ]
    return days
