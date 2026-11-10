from django.contrib import admin

from .models import BattleReport, Campaign, Commander, Scenario, UnitType


@admin.register(UnitType)
class UnitTypeAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "category",
        "attack",
        "defense",
        "speed",
        "siege_power",
        "cost_gold",
        "sort_order",
    ]
    list_editable = ["attack", "defense", "speed", "siege_power", "cost_gold"]


@admin.register(Commander)
class CommanderAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "title",
        "faction",
        "speed_mod",
        "siege_mod",
        "defense_mod",
        "morale_bonus",
    ]
    list_filter = ["faction"]


@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ["name", "key", "map_size", "seed"]


class BattleReportInline(admin.TabularInline):
    model = BattleReport
    extra = 0
    fields = [
        "game_time",
        "location",
        "kind",
        "outcome",
        "player_losses",
        "enemy_losses",
    ]
    readonly_fields = fields


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = [
        "name",
        "mode",
        "scenario",
        "difficulty",
        "status",
        "game_time",
        "updated_at",
    ]
    list_filter = ["mode", "status", "difficulty"]
    inlines = [BattleReportInline]


@admin.register(BattleReport)
class BattleReportAdmin(admin.ModelAdmin):
    list_display = [
        "location",
        "kind",
        "outcome",
        "player_losses",
        "enemy_losses",
        "campaign",
    ]
    list_filter = ["kind", "outcome"]
