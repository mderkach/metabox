## ADDED Requirements

### Requirement: AC-94 The product names one concept with one word

Product texts — the panel dictionaries and the Russian texts of the daemon catalogue — SHALL NOT contain a word that the vocabulary in `apps/web/docs/guides/Glossary.md` forbids for their language, outside the exceptions the check lists by file and key. The vocabulary names each concept with one English and one Russian word, and with the schema word where the Editor keeps it. "sing-box" is forbidden except in a text that names the fork itself; the core in general is "core", «ядро».

#### Scenario: A forbidden word fails the dictionary check

- **GIVEN** a panel dictionary or the daemon catalogue with a text that contains a word the vocabulary forbids, outside the exceptions
- **WHEN** the vocabulary check runs
- **THEN** it fails and names the file, the key and the word

#### Scenario: The fork keeps its name

- **GIVEN** a text about the binary version or `sing-box check`, listed as an exception
- **WHEN** the vocabulary check runs
- **THEN** it passes

#### Scenario: An outbound has one name in Russian

- **GIVEN** the Russian dictionaries
- **WHEN** the vocabulary check runs
- **THEN** no text calls an outbound «аутбаунд» or writes it in Latin letters

#### Scenario: A group type has one name

- **GIVEN** the Russian dictionaries
- **WHEN** the vocabulary check runs
- **THEN** no text names a selector group «ручной выбор» or «селектор», and no text names a `urltest` group «самый быстрый»

#### Scenario: Russian text distinguishes a server from a config entry

- **GIVEN** a proxy server, a group member and a generic config entry in the Russian interface
- **WHEN** the application names them
- **THEN** the copy distinguishes the three concepts, and the dictionary check rejects «узел» and its declined forms
