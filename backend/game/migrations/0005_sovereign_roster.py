from django.db import migrations


def _reseed(apps, schema_editor):
    # The Sovereign replaces Lord Cassian, and every commander gets a new bare-headed portrait.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0004_commander_portraits"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
