# Russian glossary

How sing-box and panel terms are written in the Russian dictionaries (`i18n/ru.json` of the slices). A term not listed here follows the word the panel already uses; check the existing dictionaries before introducing a new one.

| Term                               | Russian             | Notes                                                                                                         |
| ---------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| outbound                           | выход, аутбаунд     | A sing-box proper name. Never «исход»: the word means nothing in the panel and is not used even for «result». |
| node (an outbound inside a group)  | узел                | «узел выбирается сам, по задержке», «Через узел».                                                             |
| rule action (`route`, `reject`, …) | действие            | Not the outbound the rule sends traffic to.                                                                   |
| rule set                           | сет правил          |                                                                                                               |
| Apply                              | применение          | The verb is «применить»; the confirmation window is part of it.                                               |
| draft                              | черновик            | The edited config before Apply.                                                                               |
| interception (dataplane)           | перехват            | «перехват трафика», «перехват DNS».                                                                           |
| download / upload direction        | входящий, исходящий | «исходящий» is a different word from «исход» and is correct here.                                             |
