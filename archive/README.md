# Archive

`calculateur-craft-dofus-fichier-unique.html` est la dernière version en fichier
unique, celle qui s'ouvrait par double-clic depuis le disque. Remplacée le
18 08 2026 par le site de `calculateur/`.

Gardée pour deux raisons : elle reste fonctionnelle hors ligne sans serveur, et
son schéma de données est le 3, donc un export fait avec elle est réimportable
dans le site, qui le migrera vers le 4.

Elle n'est plus maintenue. Ne pas y corriger un bug sans le porter dans
`calculateur/`, sinon les deux versions divergent, ce qui est exactement la
raison pour laquelle il n'y en a plus qu'une.

`test-api-dofusdude.html` vérifiait, depuis une page ouverte en `file://`, que
l'API DofusDude répondait malgré une origine `null`. Validé le 15 08 2026,
rapatrié du coffre Obsidian le 18 08 2026. Sans objet depuis le passage au site
servi : l'origine n'est plus `null`, et `outils/verifier-les-api.js` couvre la
joignabilité des deux API avec en plus le contrôle du contrat d'identifiants.
Gardé comme trace de la question, pas comme outil.
