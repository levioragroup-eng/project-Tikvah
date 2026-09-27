# STATUS: PLANNED — stub, not implemented.
## FarmingSystem — soil preparation, planting, watering, growth, harvest.
##
## Each farm plot is a small state machine. Verbs "Dig", "Plant", "Water",
## "Harvest" on a plot node route through InteractionSystem into this module.
extends Node


## Plot lifecycle. States advance via server ticks in SHARED worlds.
enum PlotState {
	UNTILLED,   ## Raw ground. "Dig" -> TILLED.
	TILLED,     ## Ready for seed. "Plant" -> PLANTED.
	PLANTED,    ## Seed in ground, needs water. "Water" -> GROWING.
	GROWING,    ## Growing over time; may need more "Water".
	MATURE,     ## Ready. "Harvest" -> HARVESTED (yields produce).
	HARVESTED,  ## Spent. Returns to TILLED or FALLOW.
	FALLOW,     ## Resting soil. "Dig" -> TILLED.
}


## plot node -> { state: PlotState, crop_id: String, water: float, growth: float }
var plots: Dictionary = {}


func till_plot(plot: Node) -> void:
	# PLANNED: UNTILLED/FALLOW -> TILLED.
	pass


func plant_seed(plot: Node, seed_id: String) -> void:
	# PLANNED: TILLED -> PLANTED; consume one seed from player inventory
	# (inventory mutation validated server-side in SHARED worlds).
	pass


func water_plot(plot: Node) -> void:
	# PLANNED: raise moisture; PLANTED -> GROWING.
	pass


func tick_growth(_delta: float) -> void:
	# PLANNED: advance GROWING plots toward MATURE based on water + season +
	# weather from WorldManager. Called by the authoritative simulation only.
	pass


func harvest_plot(plot: Node) -> void:
	# PLANNED: MATURE -> HARVESTED; grant produce to player inventory
	# (server-validated).
	pass
