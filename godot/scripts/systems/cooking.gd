extends Node
class_name Cooking
## TIKVAH 2.0 — cooking (life-systems track).
##
## Simple inventory + recipe book. Ingredients arrive as stub items from
## harvests ("produce") and catches (fish names); cook() consumes the
## listed ingredients and produces a meal.
##
## Public API:
##   RECIPES: Dictionary   {recipe_name: Array of ingredient names}
##   add_ingredient(item: String, n: int = 1)
##   remove_ingredient(item: String, n: int = 1) -> bool
##   count(item: String) -> int
##   can_cook(recipe: String) -> bool
##   cook(recipe: String) -> bool     consumes ingredients, +1 meal, emits cooked
##   meals: int
##   eat_meal() -> bool               -1 meal (for the "Eat a meal" verb)
##   cooked(recipe: String)

signal cooked(recipe: String)

const RECIPES := {
	"Harvest Stew": ["produce", "fish"],
}

var meals: int = 0
var _inv: Dictionary = {} # item name -> count


func _fish_ingredient_names() -> Array[String]:
	# Any caught fish satisfies the "fish" slot.
	return ["Sunscale Perch", "Brook Trout", "Willowfin", "Silverbelly"]


# ------------------------------------------------------------------ public API

func add_ingredient(item: String, n: int = 1) -> void:
	_inv[item] = int(_inv.get(item, 0)) + n


func remove_ingredient(item: String, n: int = 1) -> bool:
	var have := int(_inv.get(item, 0))
	if have < n:
		return false
	_inv[item] = have - n
	return true


func count(item: String) -> int:
	return int(_inv.get(item, 0))


## A recipe is cookable when every listed ingredient is on hand.
## The "fish" ingredient slot accepts any caught fish by name.
func can_cook(recipe: String) -> bool:
	if not RECIPES.has(recipe):
		return false
	for need in RECIPES[recipe]:
		if need == "fish":
			if not _has_any_fish():
				return false
		elif count(need) < 1:
			return false
	return true


## Cook a recipe: consume ingredients, gain a meal. Returns false when
## the recipe is unknown or ingredients are missing.
func cook(recipe: String) -> bool:
	if not can_cook(recipe):
		return false
	for need in RECIPES[recipe]:
		if need == "fish":
			_remove_one_fish()
		else:
			remove_ingredient(need, 1)
	meals += 1
	cooked.emit(recipe)
	return true


## Eat a meal from the pot. Returns false when there are none.
func eat_meal() -> bool:
	if meals < 1:
		return false
	meals -= 1
	return true


func recipe_names() -> Array:
	return RECIPES.keys()


func _has_any_fish() -> bool:
	for f in _fish_ingredient_names():
		if count(f) > 0:
			return true
	return false


func _remove_one_fish() -> void:
	for f in _fish_ingredient_names():
		if count(f) > 0:
			remove_ingredient(f, 1)
			return
