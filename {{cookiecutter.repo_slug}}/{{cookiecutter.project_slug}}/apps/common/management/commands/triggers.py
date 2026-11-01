"""Every trigger this project installs, and what each does: `pgtrigger ls` says only whether one is installed."""

import json
import re

import pgtrigger
from django.core.management import BaseCommand


# Read off the compiled body rather than the trigger class, which is free to compile to anything.
VERBS = r"(?:INSERT INTO|UPDATE|DELETE FROM)"
WRITES = re.compile(rf'{VERBS} "?(\w+)"?')
# A row lock is no write, but it is the whole point of the trigger taking one.
LOCKS = re.compile(r'FROM "?(\w+)"?[^;]*? FOR (?:KEY SHARE|NO KEY UPDATE|SHARE|UPDATE)')
# PL/pgSQL assigns with `=` as readily as `:=`; only statement position tells `THEN NEW."x" = ...` (assigns)
# from `IF NEW."x" = ...` (compares).
STAMPS = re.compile(r'(?:\A|;|THEN|ELSE|BEGIN)\s*NEW\."(\w+)"\s*(?::=|=)(?!=)')


def _effects(sql):
    effects = ["refuses the write"] if "RAISE EXCEPTION" in sql else []
    written = set(WRITES.findall(sql))
    effects += [f"writes {table}" for table in sorted(written)]
    effects += [f"stamps {column}" for column in sorted(set(STAMPS.findall(sql)))]
    effects += [f"locks {table}" for table in sorted(set(LOCKS.findall(sql)) - written)]
    return effects or ["see --sql"]


def _described(model, trigger):
    sql = str(trigger.render_func(model))
    return {
        "name": trigger.name,
        "installed_as": trigger.get_pgid(model),
        "timing": f"{trigger.when} {trigger.operation} {trigger.level}",
        # Resolved: a condition's repr is its memory address.
        "condition": str(trigger.condition.resolve(model)) if trigger.condition else None,
        "does": _effects(sql),
        "sql": sql,
    }


class Command(BaseCommand):
    help = "Shows every registered trigger grouped by table, with its timing, condition and what it does."

    def add_arguments(self, parser):
        parser.add_argument("--model", help="Only models whose label contains this, case-insensitively.")
        parser.add_argument("--sql", action="store_true", help="Print each trigger's compiled body.")
        parser.add_argument("--format", choices=("text", "json"), default="text")

    def handle(self, *args, **options):
        tables = {}
        for model, trigger in pgtrigger.registered():
            if options["model"] and options["model"].lower() not in model._meta.label.lower():
                continue
            tables.setdefault((model._meta.label, model._meta.db_table), []).append(_described(model, trigger))
        if options["format"] == "json":
            self._as_json(tables, sql=options["sql"])
        else:
            self._as_text(tables, sql=options["sql"])

    def _as_json(self, tables, *, sql):
        rows = [
            {
                "model": label,
                "table": table,
                "triggers": [trigger if sql else _without_sql(trigger) for trigger in triggers],
            }
            for (label, table), triggers in sorted(tables.items())
        ]
        self.stdout.write(json.dumps(rows, indent=2))

    def _as_text(self, tables, *, sql):
        for (label, table), triggers in sorted(tables.items()):
            self.stdout.write(self.style.MIGRATE_HEADING(f"{label}  ({table})"))
            for trigger in sorted(triggers, key=lambda trigger: trigger["name"]):
                self.stdout.write(f"  {trigger['name']}  {trigger['timing']}")
                if trigger["condition"]:
                    self.stdout.write(f"    when {trigger['condition']}")
                for effect in trigger["does"]:
                    self.stdout.write(f"    {effect}")
                if sql:
                    self.stdout.write(f"    {trigger['sql']}")


def _without_sql(trigger):
    return {key: value for key, value in trigger.items() if key != "sql"}
