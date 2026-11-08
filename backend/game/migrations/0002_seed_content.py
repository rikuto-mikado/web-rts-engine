from django.db import migrations


def forwards(apps, schema_editor):
    from game.seeding import seed_content

    seed_content(apps)


class Migration(migrations.Migration):
    dependencies = [("game", "0001_initial")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
