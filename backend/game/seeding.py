from . import seed_data


def seed_content(apps=None) -> dict[str, int]:
    """Create or update the default units, commanders and scenarios.

    `apps` is the historical app registry when called from a migration.
    """
    if apps is None:
        from django.apps import apps as global_apps

        apps = global_apps
    UnitType = apps.get_model("game", "UnitType")
    Commander = apps.get_model("game", "Commander")
    Scenario = apps.get_model("game", "Scenario")

    def upsert(model, rows):
        # Migrations run against historical models that may lack newer fields.
        fields = {f.name for f in model._meta.get_fields()}
        for row in rows:
            data = {k: v for k, v in row.items() if k in fields}
            model.objects.update_or_create(key=data.pop("key"), defaults=data)

    upsert(UnitType, seed_data.UNIT_TYPES)
    # Retire unit types that are no longer part of the roster.
    UnitType.objects.exclude(key__in=[u["key"] for u in seed_data.UNIT_TYPES]).delete()
    upsert(Commander, seed_data.COMMANDERS)
    upsert(Scenario, seed_data.SCENARIOS)
    return {
        "unit_types": len(seed_data.UNIT_TYPES),
        "commanders": len(seed_data.COMMANDERS),
        "scenarios": len(seed_data.SCENARIOS),
    }
