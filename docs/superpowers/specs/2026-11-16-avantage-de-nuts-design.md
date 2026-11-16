# Avantage de range et de nuts dans l'onglet Compare

Date : 2026-11-16
Statut : en revue

## Pourquoi

L'utilisateur étudie les textures de flop pour le c-bet : il veut reconnaître
d'un coup d'œil l'**avantage de range** et l'**avantage de nuts** pour en
déduire la fréquence de c-bet et la taille des mises. L'onglet Compare montre
déjà OOP et IP côte à côte (combos, équité, EV, EQR) ; il manque l'avantage de
nuts.

## Définitions retenues

Aucune source publique ne donne la formule exacte de GTO Wizard ou des autres
solveurs ; toutes s'accordent sur l'idée ([PokerSkill, Nut Advantage](https://www.pokerskill.com/poker-glossary/nut-advantage/),
[PokerSkill, Equity Distribution](https://www.pokerskill.com/poker-glossary/equity-distribution/),
[VIP Grinders, Range Advantage](https://www.vip-grinders.com/poker-strategy/range-advantage/)) :

- **Avantage de range** : qui a la meilleure équité moyenne (déjà affichée).
- **Avantage de nuts** : qui a la plus forte **proportion de sa propre range**
  dans le haut de la distribution d'équité. C'est une concentration (part de la
  range), pas un nombre de combos.

## Design

- Dans `ResultCompare.vue`, sous les lignes existantes : la répartition de
  chaque range en **tranches d'équité**, en % de la range (pondérée par les
  poids normalisés, comme l'équité moyenne) :
  **≥ 90 %**, **75-90 %**, **50-75 %**, **< 50 %**. Même présentation que les
  lignes existantes : valeur OOP à gauche, valeur IP à droite, barre
  bicolore, valeur la plus forte en gras.
- Une ligne de synthèse : « Nut advantage : IP (18 % vs 9 % ≥ 90 %) », d'après
  la tranche ≥ 90 % ; « — » si l'écart est inférieur à 1 point.
- Fonctionne à n'importe quel nœud (pas seulement à la racine), y compris dans
  une river recalculée. Rien si une range est vide (comme l'équité).
- Calcul côté front à partir des résultats existants (`equity`, `normalizer`) :
  aucun changement Rust.
- Fonction pure `equityBuckets(equity: number[], normalizer: number[]): number[]`
  dans `utils.ts` (parts dans l'ordre ≥ 90 / 75-90 / 50-75 / < 50, somme 1).

## Non-objectifs

- Le rapport par spot et les spots eux-mêmes (étape suivante, design à part).
- Seuils réglables.

## Vérification

- Test de `equityBuckets` : pas de framework de test front aujourd'hui ;
  vérification par un cas calculé à la main dans l'app (vue Compare d'un spot
  connu) et par `vue-tsc`. *(Choix de Claude : ajouter Vitest pour une seule
  fonction dépasse le périmètre ; à reconsidérer si la logique front grossit.)*
