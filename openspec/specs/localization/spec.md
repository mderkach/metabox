# Localization Specification

## Purpose

The languages of the product: the panel texts, the texts the daemon shows to the operator, and how each language is chosen.

## Requirements

### Requirement: AC-43 The panel speaks Russian and English

The panel SHALL speak Russian and English. On the first visit the language is taken from the browser, then from the saved choice; it is switched from the interface and survives a reload. The document language is declared by the `lang` attribute and follows the choice. A screen's text arrives together with the screen itself: the user does not see keys instead of words. How texts are organized — [ADR-0019](../../../docs/adr/ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md). A daemon failure reaches the screen in the chosen language too: every error the daemon API returns carries a stable code, the panel takes the text by the code, and the daemon's own English text is only a fallback for an unknown code and a detail under the translated cause ([ADR-0022](../../../docs/adr/ADR-0022-report-the-apply-failure-step-as-a-code.md)).

#### Scenario: The language is switched and remembered

- **GIVEN** the language switch
- **WHEN** the user picks English
- **THEN** the interface turns English, the choice is saved and the document `lang` attribute is `en`

#### Scenario: Texts arrive with the screen

- **GIVEN** the rule sets screen
- **WHEN** its route loads
- **THEN** its texts are loaded with it, and no keys are shown instead of words

#### Scenario: A daemon error is shown in the chosen language

- **GIVEN** a daemon error with a known code
- **WHEN** the panel shows it
- **THEN** it shows the translated cause, and the daemon text only for an unknown code

### Requirement: AC-75 The daemon speaks the operator language

The daemon SHALL speak English and Russian to the operator. The language is chosen when the panel is installed and stored as UCI `metabox.main.lang` (`en` or `ru`, English by default); it is changed over UCI and does not depend on the panel language of AC-43, which each user keeps choosing in the panel. The daemon help (`metaboxd -h`), the operator messages of the package init scripts, the MCP tool texts and the daemon's own texts in API answers (the `message` fallback, `reason` and `detail`) follow it; a text without a translation is shown in English. Logs stay English, codes do not change, and the output of `sing-box check` and of the fork is passed on verbatim. Decision in [ADR-0062](../../../docs/adr/ADR-0062-translate-operator-texts-with-an-english-keyed-catalogue-chosen-in-uci.md).

#### Scenario: Operator texts follow the UCI language

- **GIVEN** UCI `metabox.main.lang` is `ru`
- **WHEN** the operator runs `metaboxd -h`
- **THEN** the help is in Russian

#### Scenario: A text without a translation falls back to English

- **GIVEN** a daemon text that has no Russian translation
- **WHEN** the text is shown with `ru` chosen
- **THEN** it is shown in English

#### Scenario: Logs and codes stay as they are

- **GIVEN** UCI `metabox.main.lang` is `ru`
- **WHEN** the daemon writes a log line and answers with an error code
- **THEN** the log line is English and the code is unchanged

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
