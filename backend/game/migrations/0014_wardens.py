from django.db import migrations


def _reseed(apps, schema_editor):
    # The Wardens of the March (Rowan Fenwick) and the enemy's Thorn Hunt (Corrick Vane) join the roster.
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0013_grey_sisters"),
    ]

    operations = [migrations.RunPython(_reseed, migrations.RunPython.noop)]
