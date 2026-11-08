import json
from rest_framework import serializers

from .models import BattleReport, Campaign, Commander, Scenario, UnitType


class UnitTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitType
        fields = [
            "key", "name", "role", "description", "category", "attack", "defense", "speed",
            "siege_power", "cost_gold", "cost_manpower", "vision", "pursuit", "counters", "color",
        ]


class CommanderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commander
        fields = [
            "key", "faction", "name", "title", "specialty", "lore", "banner_color", "sigil",
            "unit_bonuses", "speed_mod", "siege_mod", "defense_mod", "morale_bonus", "vision_mod",
            "strengths", "weaknesses", "portrait",
        ]


class ScenarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scenario
        fields = ["key", "name", "description", "seed", "map_size", "definition"]


class CampaignListSerializer(serializers.ModelSerializer):
    scenario_name = serializers.CharField(source="scenario.name", read_only=True, default=None)

    class Meta:
        model = Campaign
        fields = [
            "id", "name", "mode", "seed", "scenario", "scenario_name", "difficulty", "status", "game_time",
            "summary", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


def _limit_json(value, max_bytes: int, label: str):
    """Reject oversized JSON blobs so an open endpoint cannot be used to fill the database."""
    if value is None:
        return value
    if len(json.dumps(value, separators=(",", ":"))) > max_bytes:
        raise serializers.ValidationError(f"{label} is too large (max {max_bytes // 1024} KB).")
    return value


class CampaignSerializer(CampaignListSerializer):
    class Meta(CampaignListSerializer.Meta):
        fields = CampaignListSerializer.Meta.fields + ["state"]

    def validate_state(self, value):
        if value is not None and not isinstance(value, dict):
            raise serializers.ValidationError("State must be a JSON object.")
        return _limit_json(value, 64 * 1024, "State")

    def validate_summary(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Summary must be a JSON object.")
        return _limit_json(value, 8 * 1024, "Summary")


class BattleReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = BattleReport
        fields = [
            "id", "campaign", "game_time", "location", "kind", "outcome", "player_force",
            "enemy_force", "player_losses", "enemy_losses", "details", "created_at",
        ]
        read_only_fields = ["id", "campaign", "created_at"]

    def validate_details(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Details must be a JSON object.")
        return _limit_json(value, 16 * 1024, "Details")
