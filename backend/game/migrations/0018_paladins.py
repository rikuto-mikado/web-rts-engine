from django.db import migrations


def _reseed(apps, schema_editor):
    # The High King's Paladins join the roster (they come only at his blessing).
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0017_night_sappers"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
