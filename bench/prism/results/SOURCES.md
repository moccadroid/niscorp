# Every task, as every library writes it

What `libs/<id>.mjs` holds as `source`: the form an author writes and a host stores.

## `project` — Pick and rename fields

Four fields out of one order, two of them from nested objects, under new names.

**CEL (@marcbachmann/cel-js)**

```
{"id": id, "name": customer.name, "email": customer.email, "city": customer.address.city}
```

**GROQ (groq-js)**

```
{id, "name": customer.name, "email": customer.email, "city": customer.address.city}
```

**A function written by hand**

```
(order) => ({ id: order.id, name: order.customer.name, email: order.customer.email, city: order.customer.address.city })
```

**JMESPath (jmespath.js)**

```
{id: id, name: customer.name, email: customer.email, city: customer.address.city}
```

**JMESPath Community**

```
{id: id, name: customer.name, email: customer.email, city: customer.address.city}
```

**Jora**

```
{ id, name: customer.name, email: customer.email, city: customer.address.city }
```

**jq (jq-wasm)**

```
{id, name: .customer.name, email: .customer.email, city: .customer.address.city}
```

**JSON-e**

```json
{
  "id": {
    "$eval": "id"
  },
  "name": {
    "$eval": "customer.name"
  },
  "email": {
    "$eval": "customer.email"
  },
  "city": {
    "$eval": "customer.address.city"
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "name": {
      "var": "customer.name"
    },
    "email": {
      "var": "customer.email"
    },
    "city": {
      "var": "customer.address.city"
    }
  }
}
```

**json-logic-engine (build)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "name": {
      "var": "customer.name"
    },
    "email": {
      "var": "customer.email"
    },
    "city": {
      "var": "customer.address.city"
    }
  }
}
```

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{ "id": id, "name": customer.name, "email": customer.email, "city": customer.address.city }
```

**JSON Query (JSON format)**

```json
[
  "object",
  {
    "id": [
      "get",
      "id"
    ],
    "name": [
      "get",
      "customer",
      "name"
    ],
    "email": [
      "get",
      "customer",
      "email"
    ],
    "city": [
      "get",
      "customer",
      "address",
      "city"
    ]
  }
]
```

**JSON Query (text format)**

```
{ id: .id, name: .customer.name, email: .customer.email, city: .customer.address.city }
```

**lodash**

```
(order) => ({
    id: order.id,
    name: _.get(order, 'customer.name'),
    email: _.get(order, 'customer.email'),
    city: _.get(order, 'customer.address.city'),
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "name": "$customer.name",
      "email": "$customer.email",
      "city": "$customer.address.city"
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "id": {
    "$ref": "$.id"
  },
  "name": {
    "$ref": "$.customer.name"
  },
  "email": {
    "$ref": "$.customer.email"
  },
  "city": {
    "$ref": "$.customer.address.city"
  }
}
```

## `reshape` — Reshape into a nested object

A new nested shape, with the order lines mapped to { sku, qty }.

**CEL (@marcbachmann/cel-js)**

```
{"order": dyn({"id": id, "status": status}), "buyer": dyn({"name": customer.name, "location": dyn({"city": customer.address.city, "country": customer.address.country})}), "lines": dyn(items.map(item, {"sku": item.sku, "qty": item.qty}))}
```

**GROQ (groq-js)**

```
{"order": {id, status}, "buyer": {"name": customer.name, "location": {"city": customer.address.city, "country": customer.address.country}}, "lines": items[]{sku, qty}}
```

**A function written by hand**

```
(order) => ({
      order: { id: order.id, status: order.status },
      buyer: { name: order.customer.name, location: { city: order.customer.address.city, country: order.customer.address.country } },
      lines: order.items.map((item) => ({ sku: item.sku, qty: item.qty })),
    })
```

**JMESPath (jmespath.js)**

```
{
  order: {id: id, status: status},
  buyer: {name: customer.name, location: {city: customer.address.city, country: customer.address.country}},
  lines: items[*].{sku: sku, qty: qty}
}
```

**JMESPath Community**

```
{
  order: {id: id, status: status},
  buyer: {name: customer.name, location: {city: customer.address.city, country: customer.address.country}},
  lines: items[*].{sku: sku, qty: qty}
}
```

**Jora**

```
{ order: { id, status }, buyer: { name: customer.name, location: { city: customer.address.city, country: customer.address.country } }, lines: items.({ sku, qty }) }
```

**jq (jq-wasm)**

```
{order: {id, status}, buyer: {name: .customer.name, location: (.customer.address | {city, country})}, lines: [.items[] | {sku, qty}]}
```

**JSON-e**

```json
{
  "order": {
    "id": {
      "$eval": "id"
    },
    "status": {
      "$eval": "status"
    }
  },
  "buyer": {
    "name": {
      "$eval": "customer.name"
    },
    "location": {
      "city": {
        "$eval": "customer.address.city"
      },
      "country": {
        "$eval": "customer.address.country"
      }
    }
  },
  "lines": {
    "$map": {
      "$eval": "items"
    },
    "each(item)": {
      "sku": {
        "$eval": "item.sku"
      },
      "qty": {
        "$eval": "item.qty"
      }
    }
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "eachKey": {
    "order": {
      "eachKey": {
        "id": {
          "var": "id"
        },
        "status": {
          "var": "status"
        }
      }
    },
    "buyer": {
      "eachKey": {
        "name": {
          "var": "customer.name"
        },
        "location": {
          "eachKey": {
            "city": {
              "var": "customer.address.city"
            },
            "country": {
              "var": "customer.address.country"
            }
          }
        }
      }
    },
    "lines": {
      "map": [
        {
          "var": "items"
        },
        {
          "eachKey": {
            "sku": {
              "var": "sku"
            },
            "qty": {
              "var": "qty"
            }
          }
        }
      ]
    }
  }
}
```

**json-logic-engine (build)**

```json
{
  "eachKey": {
    "order": {
      "eachKey": {
        "id": {
          "var": "id"
        },
        "status": {
          "var": "status"
        }
      }
    },
    "buyer": {
      "eachKey": {
        "name": {
          "var": "customer.name"
        },
        "location": {
          "eachKey": {
            "city": {
              "var": "customer.address.city"
            },
            "country": {
              "var": "customer.address.country"
            }
          }
        }
      }
    },
    "lines": {
      "map": [
        {
          "var": "items"
        },
        {
          "eachKey": {
            "sku": {
              "var": "sku"
            },
            "qty": {
              "var": "qty"
            }
          }
        }
      ]
    }
  }
}
```

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{
  "order": { "id": id, "status": status },
  "buyer": { "name": customer.name, "location": { "city": customer.address.city, "country": customer.address.country } },
  "lines": [items.{ "sku": sku, "qty": qty }]
}
```

**JSON Query (JSON format)**

```json
[
  "object",
  {
    "order": [
      "object",
      {
        "id": [
          "get",
          "id"
        ],
        "status": [
          "get",
          "status"
        ]
      }
    ],
    "buyer": [
      "object",
      {
        "name": [
          "get",
          "customer",
          "name"
        ],
        "location": [
          "object",
          {
            "city": [
              "get",
              "customer",
              "address",
              "city"
            ],
            "country": [
              "get",
              "customer",
              "address",
              "country"
            ]
          }
        ]
      }
    ],
    "lines": [
      "pipe",
      [
        "get",
        "items"
      ],
      [
        "pick",
        [
          "get",
          "sku"
        ],
        [
          "get",
          "qty"
        ]
      ]
    ]
  }
]
```

**JSON Query (text format)**

```
{
  order: { id: .id, status: .status },
  buyer: {
    name: .customer.name,
    location: { city: .customer.address.city, country: .customer.address.country }
  },
  lines: .items | pick(.sku, .qty)
}
```

**lodash**

```
(order) => ({
    order: _.pick(order, ['id', 'status']),
    buyer: { name: _.get(order, 'customer.name'), location: _.pick(order.customer.address, ['city', 'country']) },
    lines: _.map(order.items, (item) => _.pick(item, ['sku', 'qty'])),
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "order": {
        "id": "$id",
        "status": "$status"
      },
      "buyer": {
        "name": "$customer.name",
        "location": {
          "city": "$customer.address.city",
          "country": "$customer.address.country"
        }
      },
      "lines": {
        "$map": {
          "input": "$items",
          "as": "item",
          "in": {
            "sku": "$$item.sku",
            "qty": "$$item.qty"
          }
        }
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "order": {
    "id": {
      "$ref": "$.id"
    },
    "status": {
      "$ref": "$.status"
    }
  },
  "buyer": {
    "name": {
      "$ref": "$.customer.name"
    },
    "location": {
      "city": {
        "$ref": "$.customer.address.city"
      },
      "country": {
        "$ref": "$.customer.address.country"
      }
    }
  },
  "lines": {
    "$map": {
      "over": {
        "$ref": "$.items"
      },
      "as": "item",
      "body": {
        "sku": {
          "$get": {
            "from": {
              "$var": "item"
            },
            "path": [
              "sku"
            ]
          }
        },
        "qty": {
          "$get": {
            "from": {
              "$var": "item"
            },
            "path": [
              "qty"
            ]
          }
        }
      }
    }
  }
}
```

## `strings` — Build strings

An interpolated string, a joined list, an upper-cased field.

**CEL (@marcbachmann/cel-js)**

```
{"contact": customer.name + " <" + customer.email + ">", "skus": items.map(item, item.sku).join(", "), "city": customer.address.city.upperAscii()}
```

**GROQ (groq-js)**

```
{"contact": customer.name + " <" + customer.email + ">", "skus": array::join(items[].sku, ", "), "city": upper(customer.address.city)}
```

**A function written by hand**

```
(order) => ({
      contact: `${order.customer.name} <${order.customer.email}>`,
      skus: order.items.map((item) => item.sku).join(', '),
      city: order.customer.address.city.toUpperCase(),
    })
```

**JMESPath (jmespath.js)** — not expressible: JMESPath has no function that changes the case of a string.

**JMESPath Community**

```
{
  contact: join('', [customer.name, ' <', customer.email, '>']),
  skus: join(', ', items[*].sku),
  city: upper(customer.address.city)
}
```

**Jora**

```
{ contact: `${customer.name} <${customer.email}>`, skus: items.(sku).join(", "), city: customer.address.city.toUpperCase() }
```

**jq (jq-wasm)**

```
{contact: "\(.customer.name) <\(.customer.email)>", skus: (.items | map(.sku) | join(", ")), city: (.customer.address.city | ascii_upcase)}
```

**JSON-e**

```json
{
  "contact": "${customer.name} <${customer.email}>",
  "skus": {
    "$let": {
      "skus": {
        "$map": {
          "$eval": "items"
        },
        "each(item)": {
          "$eval": "item.sku"
        }
      }
    },
    "in": {
      "$eval": "join(skus, ', ')"
    }
  },
  "city": {
    "$eval": "uppercase(customer.address.city)"
  }
}
```

**json-logic-engine (interpreted)** — not expressible: No operator changes the case of a string.

**json-logic-engine (build)** — not expressible: No operator changes the case of a string.

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{
  "contact": customer.name & " <" & customer.email & ">",
  "skus": $join(items.sku, ", "),
  "city": $uppercase(customer.address.city)
}
```

**JSON Query (JSON format)** — not expressible: No built-in function changes the case of a string, so the upper-cased city cannot be written (the interpolated string and the joined list can).

**JSON Query (text format)** — not expressible: No built-in function changes the case of a string, so the upper-cased city cannot be written (the interpolated string and the joined list can).

**lodash**

```
(order) => ({
    contact: `${order.customer.name} <${order.customer.email}>`,
    skus: _.join(_.map(order.items, 'sku'), ', '),
    city: _.toUpper(order.customer.address.city),
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "contact": {
        "$concat": [
          "$customer.name",
          " <",
          "$customer.email",
          ">"
        ]
      },
      "skus": {
        "$reduce": {
          "input": "$items.sku",
          "initialValue": "",
          "in": {
            "$concat": [
              "$$value",
              {
                "$cond": [
                  {
                    "$eq": [
                      "$$value",
                      ""
                    ]
                  },
                  "",
                  ", "
                ]
              },
              "$$this"
            ]
          }
        }
      },
      "city": {
        "$toUpper": "$customer.address.city"
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "contact": {
    "$interpolate": {
      "template": "{{name}} <{{email}}>",
      "values": {
        "name": {
          "$ref": "$.customer.name"
        },
        "email": {
          "$ref": "$.customer.email"
        }
      }
    }
  },
  "skus": {
    "$join": {
      "parts": {
        "$pluck": {
          "over": {
            "$get": {
              "from": {
                "$ref": "$"
              },
              "path": [
                "items"
              ]
            }
          },
          "key": "sku"
        }
      },
      "sep": ", "
    }
  },
  "city": {
    "$upper": {
      "$ref": "$.customer.address.city"
    }
  }
}
```

## `conditional` — Choose by condition

A three-way choice on one field and a nested choice on two.

**CEL (@marcbachmann/cel-js)**

```
{"id": id, "service": dyn(customer.tier == "gold" ? "priority" : customer.tier == "silver" ? "standard" : "basic"), "next": dyn(status == "paid" ? (shippingCents == 0 ? "ship-free" : "ship") : status == "pending" ? "hold" : "closed")}
```

**GROQ (groq-js)**

```
{id, "service": select(customer.tier == "gold" => "priority", customer.tier == "silver" => "standard", "basic"), "next": select(status == "paid" => select(shippingCents == 0 => "ship-free", "ship"), status == "pending" => "hold", "closed")}
```

**A function written by hand**

```
(order) => ({
      id: order.id,
      service: order.customer.tier === 'gold' ? 'priority' : order.customer.tier === 'silver' ? 'standard' : 'basic',
      next: order.status === 'paid' ? (order.shippingCents === 0 ? 'ship-free' : 'ship') : order.status === 'pending' ? 'hold' : 'closed',
    })
```

**JMESPath (jmespath.js)**

```
{
  id: id,
  service: (customer.tier == 'gold' && 'priority') || (customer.tier == 'silver' && 'standard') || 'basic',
  next: (status == 'paid' && ((shippingCents == `0` && 'ship-free') || 'ship')) || (status == 'pending' && 'hold') || 'closed'
}
```

**JMESPath Community**

```
{
  id: id,
  service: customer.tier == 'gold' ? 'priority' : customer.tier == 'silver' ? 'standard' : 'basic',
  next: status == 'paid' ? (shippingCents == `0` ? 'ship-free' : 'ship') : status == 'pending' ? 'hold' : 'closed'
}
```

**Jora**

```
{ id, service: customer.tier = "gold" ? "priority" : customer.tier = "silver" ? "standard" : "basic", next: status = "paid" ? (shippingCents = 0 ? "ship-free" : "ship") : status = "pending" ? "hold" : "closed" }
```

**jq (jq-wasm)**

```
{id, service: (if .customer.tier == "gold" then "priority" elif .customer.tier == "silver" then "standard" else "basic" end), next: (if .status == "paid" then (if .shippingCents == 0 then "ship-free" else "ship" end) elif .status == "pending" then "hold" else "closed" end)}
```

**JSON-e**

```json
{
  "id": {
    "$eval": "id"
  },
  "service": {
    "$switch": {
      "customer.tier == 'gold'": "priority",
      "customer.tier == 'silver'": "standard",
      "$default": "basic"
    }
  },
  "next": {
    "$if": "status == 'paid'",
    "then": {
      "$if": "shippingCents == 0",
      "then": "ship-free",
      "else": "ship"
    },
    "else": {
      "$if": "status == 'pending'",
      "then": "hold",
      "else": "closed"
    }
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "service": {
      "if": [
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "gold"
          ]
        },
        "priority",
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "silver"
          ]
        },
        "standard",
        "basic"
      ]
    },
    "next": {
      "if": [
        {
          "==": [
            {
              "var": "status"
            },
            "paid"
          ]
        },
        {
          "if": [
            {
              "==": [
                {
                  "var": "shippingCents"
                },
                0
              ]
            },
            "ship-free",
            "ship"
          ]
        },
        {
          "==": [
            {
              "var": "status"
            },
            "pending"
          ]
        },
        "hold",
        "closed"
      ]
    }
  }
}
```

**json-logic-engine (build)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "service": {
      "if": [
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "gold"
          ]
        },
        "priority",
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "silver"
          ]
        },
        "standard",
        "basic"
      ]
    },
    "next": {
      "if": [
        {
          "==": [
            {
              "var": "status"
            },
            "paid"
          ]
        },
        {
          "if": [
            {
              "==": [
                {
                  "var": "shippingCents"
                },
                0
              ]
            },
            "ship-free",
            "ship"
          ]
        },
        {
          "==": [
            {
              "var": "status"
            },
            "pending"
          ]
        },
        "hold",
        "closed"
      ]
    }
  }
}
```

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{
  "id": id,
  "service": customer.tier = "gold" ? "priority" : customer.tier = "silver" ? "standard" : "basic",
  "next": status = "paid" ? (shippingCents = 0 ? "ship-free" : "ship") : status = "pending" ? "hold" : "closed"
}
```

**JSON Query (JSON format)**

```json
[
  "object",
  {
    "id": [
      "get",
      "id"
    ],
    "service": [
      "if",
      [
        "eq",
        [
          "get",
          "customer",
          "tier"
        ],
        "gold"
      ],
      "priority",
      [
        "if",
        [
          "eq",
          [
            "get",
            "customer",
            "tier"
          ],
          "silver"
        ],
        "standard",
        "basic"
      ]
    ],
    "next": [
      "if",
      [
        "eq",
        [
          "get",
          "status"
        ],
        "paid"
      ],
      [
        "if",
        [
          "eq",
          [
            "get",
            "shippingCents"
          ],
          0
        ],
        "ship-free",
        "ship"
      ],
      [
        "if",
        [
          "eq",
          [
            "get",
            "status"
          ],
          "pending"
        ],
        "hold",
        "closed"
      ]
    ]
  }
]
```

**JSON Query (text format)**

```
{
  id: .id,
  service: if(.customer.tier == "gold", "priority", if(.customer.tier == "silver", "standard", "basic")),
  next: if(
    .status == "paid",
    if(.shippingCents == 0, "ship-free", "ship"),
    if(.status == "pending", "hold", "closed")
  )
}
```

**lodash**

```
(order) => ({
    id: order.id,
    service: order.customer.tier === 'gold' ? 'priority' : order.customer.tier === 'silver' ? 'standard' : 'basic',
    next: order.status === 'paid' ? (order.shippingCents === 0 ? 'ship-free' : 'ship') : order.status === 'pending' ? 'hold' : 'closed',
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "service": {
        "$switch": {
          "branches": [
            {
              "case": {
                "$eq": [
                  "$customer.tier",
                  "gold"
                ]
              },
              "then": "priority"
            },
            {
              "case": {
                "$eq": [
                  "$customer.tier",
                  "silver"
                ]
              },
              "then": "standard"
            }
          ],
          "default": "basic"
        }
      },
      "next": {
        "$switch": {
          "branches": [
            {
              "case": {
                "$eq": [
                  "$status",
                  "paid"
                ]
              },
              "then": {
                "$cond": [
                  {
                    "$eq": [
                      "$shippingCents",
                      0
                    ]
                  },
                  "ship-free",
                  "ship"
                ]
              }
            },
            {
              "case": {
                "$eq": [
                  "$status",
                  "pending"
                ]
              },
              "then": "hold"
            }
          ],
          "default": "closed"
        }
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "id": {
    "$ref": "$.id"
  },
  "service": {
    "$case": {
      "branches": [
        {
          "when": {
            "$eq": [
              {
                "$ref": "$.customer.tier"
              },
              "gold"
            ]
          },
          "then": "priority"
        },
        {
          "when": {
            "$eq": [
              {
                "$ref": "$.customer.tier"
              },
              "silver"
            ]
          },
          "then": "standard"
        }
      ],
      "else": "basic"
    }
  },
  "next": {
    "$case": {
      "branches": [
        {
          "when": {
            "$eq": [
              {
                "$ref": "$.status"
              },
              "paid"
            ]
          },
          "then": {
            "$case": {
              "branches": [
                {
                  "when": {
                    "$eq": [
                      {
                        "$ref": "$.shippingCents"
                      },
                      0
                    ]
                  },
                  "then": "ship-free"
                }
              ],
              "else": "ship"
            }
          }
        },
        {
          "when": {
            "$eq": [
              {
                "$ref": "$.status"
              },
              "pending"
            ]
          },
          "then": "hold"
        }
      ],
      "else": "closed"
    }
  }
}
```

## `defaults` — Fill in what is missing

A missing key and a null each fall back to a default; two constants are added.

**CEL (@marcbachmann/cel-js)** (glue: The order is handed over as the variable `order`, not as the variables themselves: has() tests a field of a value, and a variable that is not there is an error.)

```
{"id": order.id, "currency": dyn("EUR"), "gift": dyn(false), "notes": has(order.notes) ? order.notes : "", "coupon": order.couponCode != null ? order.couponCode : "NONE"}
```

**GROQ (groq-js)**

```
{id, "currency": "EUR", "gift": false, "notes": coalesce(notes, ""), "coupon": coalesce(couponCode, "NONE")}
```

**A function written by hand**

```
(order) => ({ id: order.id, currency: 'EUR', gift: false, notes: order.notes ?? '', coupon: order.couponCode ?? 'NONE' })
```

**JMESPath (jmespath.js)**

```
{id: id, currency: 'EUR', gift: `false`, notes: not_null(notes, ''), coupon: not_null(couponCode, 'NONE')}
```

**JMESPath Community**

```
{id: id, currency: 'EUR', gift: `false`, notes: not_null(notes, ''), coupon: not_null(couponCode, 'NONE')}
```

**Jora**

```
{ id, currency: "EUR", gift: false, notes: notes ?? "", coupon: couponCode ?? "NONE" }
```

**jq (jq-wasm)**

```
{id, currency: "EUR", gift: false, notes: (.notes // ""), coupon: (.couponCode // "NONE")}
```

**JSON-e**

```json
{
  "id": {
    "$eval": "id"
  },
  "currency": "EUR",
  "gift": false,
  "notes": {
    "$if": "defined('notes')",
    "then": {
      "$eval": "notes"
    },
    "else": ""
  },
  "coupon": {
    "$if": "couponCode == null",
    "then": "NONE",
    "else": {
      "$eval": "couponCode"
    }
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "currency": "EUR",
    "gift": false,
    "notes": {
      "??": [
        {
          "var": "notes"
        },
        ""
      ]
    },
    "coupon": {
      "??": [
        {
          "var": "couponCode"
        },
        "NONE"
      ]
    }
  }
}
```

**json-logic-engine (build)**

```json
{
  "eachKey": {
    "id": {
      "var": "id"
    },
    "currency": "EUR",
    "gift": false,
    "notes": {
      "??": [
        {
          "var": "notes"
        },
        ""
      ]
    },
    "coupon": {
      "??": [
        {
          "var": "couponCode"
        },
        "NONE"
      ]
    }
  }
}
```

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{ "id": id, "currency": "EUR", "gift": false, "notes": notes ?? "", "coupon": couponCode ?: "NONE" }
```

**JSON Query (JSON format)**

```json
[
  "object",
  {
    "id": [
      "get",
      "id"
    ],
    "currency": "EUR",
    "gift": false,
    "notes": [
      "if",
      [
        "exists",
        [
          "get",
          "notes"
        ]
      ],
      [
        "get",
        "notes"
      ],
      ""
    ],
    "coupon": [
      "if",
      [
        "eq",
        [
          "get",
          "couponCode"
        ],
        null
      ],
      "NONE",
      [
        "get",
        "couponCode"
      ]
    ]
  }
]
```

**JSON Query (text format)**

```
{
  id: .id,
  currency: "EUR",
  gift: false,
  notes: if(exists(.notes), .notes, ""),
  coupon: if(.couponCode == null, "NONE", .couponCode)
}
```

**lodash**

```
(order) => ({
    id: order.id,
    currency: 'EUR',
    gift: false,
    notes: _.defaultTo(order.notes, ''),
    coupon: _.defaultTo(order.couponCode, 'NONE'),
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "currency": {
        "$literal": "EUR"
      },
      "gift": {
        "$literal": false
      },
      "notes": {
        "$ifNull": [
          "$notes",
          ""
        ]
      },
      "coupon": {
        "$ifNull": [
          "$couponCode",
          "NONE"
        ]
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "id": {
    "$ref": "$.id"
  },
  "currency": "EUR",
  "gift": false,
  "notes": {
    "$get": {
      "from": {
        "$ref": "$"
      },
      "path": [
        "notes"
      ],
      "fallback": ""
    }
  },
  "coupon": {
    "$coalesce": [
      {
        "$ref": "$.couponCode"
      },
      "NONE"
    ]
  }
}
```

## `dates` — Format a date and count days

The order's day as YYYY-MM-DD (UTC), and the whole days from then to a fixed moment, 2026-10-01T00:00:00Z.

**CEL (@marcbachmann/cel-js)** (glue: ageDays is a CEL int, which the package returns as a BigInt: it is converted to a number.)

```
{"id": id, "day": dyn(placedAt.substring(0, 10)), "ageDays": dyn((timestamp(now) - timestamp(placedAt)).getHours() / 24)}
```

**GROQ (groq-js)**

```
{id, "day": string::split(placedAt, "T")[0], "seconds": dateTime(now) - dateTime(placedAt)}{id, day, "ageDays": (seconds - seconds % 86400) / 86400}
```

**A function written by hand**

```
(order) => ({ id: order.id, day: order.placedAt.slice(0, 10), ageDays: Math.floor((Date.parse(order.now) - Date.parse(order.placedAt)) / DAY) })
```

**JMESPath (jmespath.js)** — not expressible: JMESPath has no date functions and no arithmetic, and a string cannot be sliced.

**JMESPath Community** — not expressible: No date functions: a timestamp cannot be turned into a number, so the days between two of them cannot be counted.

**Jora** — not expressible: Jora has no date parsing and no date arithmetic: the whole days between two ISO times cannot be counted.

**jq (jq-wasm)**

```
{id, day: (.placedAt | fromdate | strftime("%Y-%m-%d")), ageDays: (((.now | fromdate) - (.placedAt | fromdate)) / 86400 | floor)}
```

**JSON-e** — not expressible: No date parsing and no difference between two dates: the only date feature is $fromNow, which makes a timestamp from an offset.

**json-logic-engine (interpreted)** — not expressible: No operator parses a date or measures the time between two.

**json-logic-engine (build)** — not expressible: No operator parses a date or measures the time between two.

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
{
  "id": id,
  "day": $fromMillis($toMillis(placedAt), "[Y0001]-[M01]-[D01]"),
  "ageDays": $floor(($toMillis(now) - $toMillis(placedAt)) / 86400000)
}
```

**JSON Query (JSON format)** — not expressible: No date functions: a timestamp cannot be parsed or subtracted, so the whole days until `now` cannot be written (the day itself is a substring).

**JSON Query (text format)** — not expressible: No date functions: a timestamp cannot be parsed or subtracted, so the whole days until `now` cannot be written (the day itself is a substring).

**lodash**

```
(order) => ({
    id: order.id,
    day: order.placedAt.slice(0, 10),
    ageDays: _.floor((Date.parse(order.now) - Date.parse(order.placedAt)) / DAY),
  })
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list and the one resulting document is unwrapped.)

```json
[
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "day": {
        "$dateToString": {
          "date": {
            "$toDate": "$placedAt"
          },
          "format": "%Y-%m-%d"
        }
      },
      "ageDays": {
        "$floor": {
          "$divide": [
            {
              "$subtract": [
                {
                  "$toDate": "$now"
                },
                {
                  "$toDate": "$placedAt"
                }
              ]
            },
            86400000
          ]
        }
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "id": {
    "$ref": "$.id"
  },
  "day": {
    "$date": {
      "value": {
        "$ref": "$.placedAt"
      },
      "format": "YYYY-MM-DD",
      "utc": true
    }
  },
  "ageDays": {
    "$dateDiff": {
      "from": {
        "$ref": "$.placedAt"
      },
      "to": {
        "$ref": "$.now"
      },
      "unit": "day"
    }
  }
}
```

## `rule` — Answer a yes/no rule

Paid, and gold or shipping of at least 1000, and some line with a quantity of 3 or more. The answer is a boolean.

**CEL (@marcbachmann/cel-js)**

```
status == "paid" && (customer.tier == "gold" || shippingCents >= 1000) && items.exists(item, item.qty >= 3)
```

**GROQ (groq-js)**

```
status == "paid" && (customer.tier == "gold" || shippingCents >= 1000) && count(items[qty >= 3]) > 0
```

**A function written by hand**

```
(order) => order.status === 'paid' && (order.customer.tier === 'gold' || order.shippingCents >= 1000) && order.items.some((item) => item.qty >= 3)
```

**JMESPath (jmespath.js)**

```
status == 'paid' && (customer.tier == 'gold' || shippingCents >= `1000`) && length(items[?qty >= `3`]) > `0`
```

**JMESPath Community**

```
status == 'paid' && (customer.tier == 'gold' || shippingCents >= `1000`) && length(items[?qty >= `3`]) > `0`
```

**Jora**

```
status = "paid" and (customer.tier = "gold" or shippingCents >= 1000) and items.[qty >= 3].size() > 0
```

**jq (jq-wasm)**

```
.status == "paid" and (.customer.tier == "gold" or .shippingCents >= 1000) and any(.items[]; .qty >= 3)
```

**JSON-e**

```json
{
  "$let": {
    "large": {
      "$map": {
        "$eval": "items"
      },
      "each(item)": {
        "$if": "item.qty >= 3",
        "then": {
          "$eval": "item"
        }
      }
    }
  },
  "in": {
    "$eval": "status == 'paid' && (customer.tier == 'gold' || shippingCents >= 1000) && len(large) > 0"
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "and": [
    {
      "==": [
        {
          "var": "status"
        },
        "paid"
      ]
    },
    {
      "or": [
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "gold"
          ]
        },
        {
          ">=": [
            {
              "var": "shippingCents"
            },
            1000
          ]
        }
      ]
    },
    {
      "some": [
        {
          "var": "items"
        },
        {
          ">=": [
            {
              "var": "qty"
            },
            3
          ]
        }
      ]
    }
  ]
}
```

**json-logic-engine (build)**

```json
{
  "and": [
    {
      "==": [
        {
          "var": "status"
        },
        "paid"
      ]
    },
    {
      "or": [
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "gold"
          ]
        },
        {
          ">=": [
            {
              "var": "shippingCents"
            },
            1000
          ]
        }
      ]
    },
    {
      "some": [
        {
          "var": "items"
        },
        {
          ">=": [
            {
              "var": "qty"
            },
            3
          ]
        }
      ]
    }
  ]
}
```

**JsonLogic (json-logic-js)**

```json
{
  "and": [
    {
      "==": [
        {
          "var": "status"
        },
        "paid"
      ]
    },
    {
      "or": [
        {
          "==": [
            {
              "var": "customer.tier"
            },
            "gold"
          ]
        },
        {
          ">=": [
            {
              "var": "shippingCents"
            },
            1000
          ]
        }
      ]
    },
    {
      "some": [
        {
          "var": "items"
        },
        {
          ">=": [
            {
              "var": "qty"
            },
            3
          ]
        }
      ]
    }
  ]
}
```

**JSONata**

```
status = "paid" and (customer.tier = "gold" or shippingCents >= 1000) and $exists(items[qty >= 3])
```

**JSON Query (JSON format)**

```json
[
  "and",
  [
    "eq",
    [
      "get",
      "status"
    ],
    "paid"
  ],
  [
    "or",
    [
      "eq",
      [
        "get",
        "customer",
        "tier"
      ],
      "gold"
    ],
    [
      "gte",
      [
        "get",
        "shippingCents"
      ],
      1000
    ]
  ],
  [
    "gt",
    [
      "pipe",
      [
        "get",
        "items"
      ],
      [
        "filter",
        [
          "gte",
          [
            "get",
            "qty"
          ],
          3
        ]
      ],
      [
        "size"
      ]
    ],
    0
  ]
]
```

**JSON Query (text format)**

```
.status == "paid"
  and (.customer.tier == "gold" or .shippingCents >= 1000)
  and (.items | filter(.qty >= 3) | size()) > 0
```

**lodash**

```
(order) =>
    order.status === 'paid' && (order.customer.tier === 'gold' || order.shippingCents >= 1000) && _.some(order.items, (item) => item.qty >= 3)
```

**mingo (aggregation pipeline)** (glue: The order is wrapped in a one-element list; a pipeline answers documents, so the boolean is the one field of the one resulting document.)

```json
[
  {
    "$project": {
      "_id": 0,
      "answer": {
        "$and": [
          {
            "$eq": [
              "$status",
              "paid"
            ]
          },
          {
            "$or": [
              {
                "$eq": [
                  "$customer.tier",
                  "gold"
                ]
              },
              {
                "$gte": [
                  "$shippingCents",
                  1000
                ]
              }
            ]
          },
          {
            "$anyElementTrue": {
              "$map": {
                "input": "$items",
                "as": "item",
                "in": {
                  "$gte": [
                    "$$item.qty",
                    3
                  ]
                }
              }
            }
          }
        ]
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "$and": [
    {
      "$eq": [
        {
          "$ref": "$.status"
        },
        "paid"
      ]
    },
    {
      "$or": [
        {
          "$eq": [
            {
              "$ref": "$.customer.tier"
            },
            "gold"
          ]
        },
        {
          "$gte": [
            {
              "$ref": "$.shippingCents"
            },
            1000
          ]
        }
      ]
    },
    {
      "$not": {
        "$empty": {
          "$filter": {
            "over": {
              "$ref": "$.items"
            },
            "as": "item",
            "when": {
              "$gte": [
                {
                  "$get": {
                    "from": {
                      "$var": "item"
                    },
                    "path": [
                      "qty"
                    ]
                  }
                },
                3
              ]
            }
          }
        }
      }
    }
  ]
}
```

## `totals` — Map with a computed field

For every order: its id, its total (each line's qty × unitCents, plus shipping) and how many units it holds.

**CEL (@marcbachmann/cel-js)** — not expressible: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The lines of an order cannot be added up.

**GROQ (groq-js)**

```
orders[]{id, "totalCents": math::sum(items[]{"cents": qty * unitCents}.cents) + shippingCents, "units": math::sum(items[].qty)}
```

**A function written by hand**

```
({ orders }) => orders.map((order) => ({ id: order.id, totalCents: totalCents(order), units: order.items.reduce((sum, item) => sum + item.qty, 0) }))
```

**JMESPath (jmespath.js)** — not expressible: JMESPath has no arithmetic: nothing multiplies qty by unitCents or adds shipping to a sum.

**JMESPath Community**

```
orders[*].{id: id, totalCents: sum(map(&(qty * unitCents), items)) + shippingCents, units: sum(items[*].qty)}
```

**Jora**

```
orders.({ id, totalCents: items.sum(=> qty * unitCents) + shippingCents, units: items.sum(=> qty) })
```

**jq (jq-wasm)**

```
def total: (.items | map(.qty * .unitCents) | add) + .shippingCents; [.orders[] | {id, totalCents: total, units: (.items | map(.qty) | add)}]
```

**JSON-e**

```json
{
  "$map": {
    "$eval": "orders"
  },
  "each(order)": {
    "id": {
      "$eval": "order.id"
    },
    "totalCents": {
      "$let": {
        "lines": {
          "$reduce": {
            "$eval": "order.items"
          },
          "initial": 0,
          "each(sum, item)": {
            "$eval": "sum + item.qty * item.unitCents"
          }
        }
      },
      "in": {
        "$eval": "lines + order.shippingCents"
      }
    },
    "units": {
      "$reduce": {
        "$eval": "order.items"
      },
      "initial": 0,
      "each(sum, item)": {
        "$eval": "sum + item.qty"
      }
    }
  }
}
```

**json-logic-engine (interpreted)**

```json
{
  "map": [
    {
      "var": "orders"
    },
    {
      "eachKey": {
        "id": {
          "var": "id"
        },
        "totalCents": {
          "+": [
            {
              "reduce": [
                {
                  "var": "items"
                },
                {
                  "+": [
                    {
                      "var": "accumulator"
                    },
                    {
                      "*": [
                        {
                          "var": "current.qty"
                        },
                        {
                          "var": "current.unitCents"
                        }
                      ]
                    }
                  ]
                },
                0
              ]
            },
            {
              "var": "shippingCents"
            }
          ]
        },
        "units": {
          "reduce": [
            {
              "var": "items"
            },
            {
              "+": [
                {
                  "var": "accumulator"
                },
                {
                  "var": "current.qty"
                }
              ]
            },
            0
          ]
        }
      }
    }
  ]
}
```

**json-logic-engine (build)**

```json
{
  "map": [
    {
      "var": "orders"
    },
    {
      "eachKey": {
        "id": {
          "var": "id"
        },
        "totalCents": {
          "+": [
            {
              "reduce": [
                {
                  "var": "items"
                },
                {
                  "+": [
                    {
                      "var": "accumulator"
                    },
                    {
                      "*": [
                        {
                          "var": "current.qty"
                        },
                        {
                          "var": "current.unitCents"
                        }
                      ]
                    }
                  ]
                },
                0
              ]
            },
            {
              "var": "shippingCents"
            }
          ]
        },
        "units": {
          "reduce": [
            {
              "var": "items"
            },
            {
              "+": [
                {
                  "var": "accumulator"
                },
                {
                  "var": "current.qty"
                }
              ]
            },
            0
          ]
        }
      }
    }
  ]
}
```

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
[orders.{ "id": id, "totalCents": $sum(items.(qty * unitCents)) + shippingCents, "units": $sum(items.qty) }]
```

**JSON Query (JSON format)**

```json
[
  "pipe",
  [
    "get",
    "orders"
  ],
  [
    "map",
    [
      "object",
      {
        "id": [
          "get",
          "id"
        ],
        "totalCents": [
          "add",
          [
            "pipe",
            [
              "get",
              "items"
            ],
            [
              "map",
              [
                "multiply",
                [
                  "get",
                  "qty"
                ],
                [
                  "get",
                  "unitCents"
                ]
              ]
            ],
            [
              "sum"
            ]
          ],
          [
            "get",
            "shippingCents"
          ]
        ],
        "units": [
          "pipe",
          [
            "get",
            "items"
          ],
          [
            "map",
            [
              "get",
              "qty"
            ]
          ],
          [
            "sum"
          ]
        ]
      }
    ]
  ]
]
```

**JSON Query (text format)**

```
.orders | map({
  id: .id,
  totalCents: (.items | map(.qty * .unitCents) | sum()) + .shippingCents,
  units: .items | map(.qty) | sum()
})
```

**lodash**

```
({ orders }) => _.map(orders, (order) => ({ id: order.id, totalCents: totalCents(order), units: _.sumBy(order.items, 'qty') }))
```

**mingo (aggregation pipeline)** (glue: input.orders is handed over as the collection.)

```json
[
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "totalCents": {
        "$add": [
          {
            "$sum": {
              "$map": {
                "input": "$items",
                "as": "item",
                "in": {
                  "$multiply": [
                    "$$item.qty",
                    "$$item.unitCents"
                  ]
                }
              }
            }
          },
          "$shippingCents"
        ]
      },
      "units": {
        "$sum": "$items.qty"
      }
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "$map": {
    "over": {
      "$ref": "$.orders"
    },
    "as": "order",
    "body": {
      "id": {
        "$get": {
          "from": {
            "$var": "order"
          },
          "path": [
            "id"
          ]
        }
      },
      "totalCents": {
        "$add": [
          {
            "$sum": {
              "over": {
                "$map": {
                  "over": {
                    "$get": {
                      "from": {
                        "$var": "order"
                      },
                      "path": [
                        "items"
                      ]
                    }
                  },
                  "as": "item",
                  "body": {
                    "$mul": [
                      {
                        "$get": {
                          "from": {
                            "$var": "item"
                          },
                          "path": [
                            "qty"
                          ]
                        }
                      },
                      {
                        "$get": {
                          "from": {
                            "$var": "item"
                          },
                          "path": [
                            "unitCents"
                          ]
                        }
                      }
                    ]
                  }
                }
              }
            }
          },
          {
            "$get": {
              "from": {
                "$var": "order"
              },
              "path": [
                "shippingCents"
              ]
            }
          }
        ]
      },
      "units": {
        "$sum": {
          "over": {
            "$pluck": {
              "over": {
                "$get": {
                  "from": {
                    "$var": "order"
                  },
                  "path": [
                    "items"
                  ]
                }
              },
              "key": "qty"
            }
          }
        }
      }
    }
  }
}
```

## `top` — Filter, sort, take

Paid orders of gold customers, newest first by placedAt (unique, ISO, so string order is time order), the first ten, as { id, placedAt }.

**CEL (@marcbachmann/cel-js)** — not expressible: CEL has no sorting, and this package has no list sort or slice function either (cel-go has them as an extension).

**GROQ (groq-js)**

```
orders[status == "paid" && customer.tier == "gold"] | order(placedAt desc)[0...10]{id, placedAt}
```

**A function written by hand**

```
({ orders }) =>
      orders
        .filter((order) => order.status === 'paid' && order.customer.tier === 'gold')
        .sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0))
        .slice(0, 10)
        .map((order) => ({ id: order.id, placedAt: order.placedAt }))
```

**JMESPath (jmespath.js)**

```
reverse(sort_by(orders[?status == 'paid' && customer.tier == 'gold'], &placedAt))[:10].{id: id, placedAt: placedAt}
```

**JMESPath Community**

```
reverse(sort_by(orders[?status == 'paid' && customer.tier == 'gold'], &placedAt))[:10].{id: id, placedAt: placedAt}
```

**Jora**

```
orders.[status = "paid" and customer.tier = "gold"].sort(placedAt desc)[0:10].({ id, placedAt })
```

**jq (jq-wasm)**

```
[.orders[] | select(.status == "paid" and .customer.tier == "gold")] | sort_by(.placedAt) | reverse | .[:10] | map({id, placedAt})
```

**JSON-e**

```json
{
  "$let": {
    "sorted": {
      "$reverse": {
        "$sort": {
          "$map": {
            "$eval": "orders"
          },
          "each(order)": {
            "$if": "order.status == 'paid' && order.customer.tier == 'gold'",
            "then": {
              "$eval": "order"
            }
          }
        },
        "by(order)": "order.placedAt"
      }
    }
  },
  "in": {
    "$map": {
      "$eval": "sorted[0:10]"
    },
    "each(order)": {
      "id": {
        "$eval": "order.id"
      },
      "placedAt": {
        "$eval": "order.placedAt"
      }
    }
  }
}
```

**json-logic-engine (interpreted)** — not expressible: No operator sorts a list, and none takes its first n.

**json-logic-engine (build)** — not expressible: No operator sorts a list, and none takes its first n.

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
[orders[status = "paid" and customer.tier = "gold"]^(>placedAt)[[0..9]].{ "id": id, "placedAt": placedAt }]
```

**JSON Query (JSON format)**

```json
[
  "pipe",
  [
    "get",
    "orders"
  ],
  [
    "filter",
    [
      "and",
      [
        "eq",
        [
          "get",
          "status"
        ],
        "paid"
      ],
      [
        "eq",
        [
          "get",
          "customer",
          "tier"
        ],
        "gold"
      ]
    ]
  ],
  [
    "sort",
    [
      "get",
      "placedAt"
    ],
    "desc"
  ],
  [
    "limit",
    10
  ],
  [
    "pick",
    [
      "get",
      "id"
    ],
    [
      "get",
      "placedAt"
    ]
  ]
]
```

**JSON Query (text format)**

```
.orders
  | filter(.status == "paid" and .customer.tier == "gold")
  | sort(.placedAt, "desc")
  | limit(10)
  | pick(.id, .placedAt)
```

**lodash**

```
({ orders }) => {
    const wanted = _.filter(orders, { status: 'paid', customer: { tier: 'gold' } });
    return _.map(_.take(_.orderBy(wanted, 'placedAt', 'desc'), 10), (order) => _.pick(order, ['id', 'placedAt']));
  }
```

**mingo (aggregation pipeline)** (glue: input.orders is handed over as the collection.)

```json
[
  {
    "$match": {
      "status": "paid",
      "customer.tier": "gold"
    }
  },
  {
    "$sort": {
      "placedAt": -1
    }
  },
  {
    "$limit": 10
  },
  {
    "$project": {
      "_id": 0,
      "id": "$id",
      "placedAt": "$placedAt"
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "$map": {
    "over": {
      "$take": {
        "from": {
          "$sortBy": {
            "over": {
              "$filter": {
                "over": {
                  "$ref": "$.orders"
                },
                "as": "order",
                "when": {
                  "$and": [
                    {
                      "$eq": [
                        {
                          "$get": {
                            "from": {
                              "$var": "order"
                            },
                            "path": [
                              "status"
                            ]
                          }
                        },
                        "paid"
                      ]
                    },
                    {
                      "$eq": [
                        {
                          "$get": {
                            "from": {
                              "$var": "order"
                            },
                            "path": [
                              "customer",
                              "tier"
                            ]
                          }
                        },
                        "gold"
                      ]
                    }
                  ]
                }
              }
            },
            "as": "order",
            "by": {
              "$get": {
                "from": {
                  "$var": "order"
                },
                "path": [
                  "placedAt"
                ]
              }
            },
            "dir": "desc"
          }
        },
        "count": 10
      }
    },
    "as": "order",
    "body": {
      "id": {
        "$get": {
          "from": {
            "$var": "order"
          },
          "path": [
            "id"
          ]
        }
      },
      "placedAt": {
        "$get": {
          "from": {
            "$var": "order"
          },
          "path": [
            "placedAt"
          ]
        }
      }
    }
  }
}
```

## `groups` — Group and aggregate

By the customer's country: how many orders, and the sum of their shipping. An object keyed by country.

**CEL (@marcbachmann/cel-js)** — not expressible: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The shipping of a country cannot be added up, and there is no grouping.

**GROQ (groq-js)** — not expressible: GROQ has no grouping, and an object key is always a literal string: an object keyed by the countries found in the data cannot be built.

**A function written by hand**

```
({ orders }) => {
      const out = {};
      for (const order of orders) {
        const group = (out[order.customer.address.country] ??= { orders: 0, shippingCents: 0 });
        group.orders += 1;
        group.shippingCents += order.shippingCents;
      }
      return out;
    }
```

**JMESPath (jmespath.js)** — not expressible: JMESPath has no grouping function, and no way to build an object whose keys come from the data.

**JMESPath Community**

```
from_items(items(group_by(orders, &customer.address.country))[*].[@[0], {orders: length(@[1]), shippingCents: sum(@[1][*].shippingCents)}])
```

**Jora**

```
orders.group(=> customer.address.country).({ key, value: { orders: value.size(), shippingCents: value.sum(=> shippingCents) } }).fromEntries()
```

**jq (jq-wasm)**

```
.orders | group_by(.customer.address.country) | map({key: .[0].customer.address.country, value: {orders: length, shippingCents: (map(.shippingCents) | add)}}) | from_entries
```

**JSON-e**

```json
{
  "$reduce": {
    "$eval": "orders"
  },
  "initial": {},
  "each(groups, order)": {
    "$let": {
      "country": {
        "$eval": "order.customer.address.country"
      }
    },
    "in": {
      "$let": {
        "group": {
          "$if": "country in groups",
          "then": {
            "$eval": "groups[country]"
          },
          "else": {
            "orders": 0,
            "shippingCents": 0
          }
        }
      },
      "in": {
        "$merge": [
          {
            "$eval": "groups"
          },
          {
            "${country}": {
              "orders": {
                "$eval": "group.orders + 1"
              },
              "shippingCents": {
                "$eval": "group.shippingCents + order.shippingCents"
              }
            }
          }
        ]
      }
    }
  }
}
```

**json-logic-engine (interpreted)** — not expressible: No operator groups a list, and none builds an object whose keys come from the data (eachKey takes fixed keys).

**json-logic-engine (build)** — not expressible: No operator groups a list, and none builds an object whose keys come from the data (eachKey takes fixed keys).

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
orders.$ { customer.address.country: { "orders": $count($), "shippingCents": $sum(shippingCents) } }
```

**JSON Query (JSON format)**

```json
[
  "pipe",
  [
    "get",
    "orders"
  ],
  [
    "groupBy",
    [
      "get",
      "customer",
      "address",
      "country"
    ]
  ],
  [
    "mapValues",
    [
      "object",
      {
        "orders": [
          "size"
        ],
        "shippingCents": [
          "pipe",
          [
            "map",
            [
              "get",
              "shippingCents"
            ]
          ],
          [
            "sum"
          ]
        ]
      }
    ]
  ]
]
```

**JSON Query (text format)**

```
.orders
  | groupBy(.customer.address.country)
  | mapValues({ orders: size(), shippingCents: map(.shippingCents) | sum() })
```

**lodash**

```
({ orders }) =>
    _.mapValues(_.groupBy(orders, 'customer.address.country'), (group) => ({ orders: group.length, shippingCents: _.sumBy(group, 'shippingCents') }))
```

**mingo (aggregation pipeline)** (glue: input.orders is handed over as the collection and the one resulting document is unwrapped.)

```json
[
  {
    "$facet": {
      "countries": [
        {
          "$group": {
            "_id": "$customer.address.country",
            "orders": {
              "$sum": 1
            },
            "shippingCents": {
              "$sum": "$shippingCents"
            }
          }
        },
        {
          "$project": {
            "_id": 0,
            "k": "$_id",
            "v": {
              "orders": "$orders",
              "shippingCents": "$shippingCents"
            }
          }
        }
      ]
    }
  },
  {
    "$replaceWith": {
      "$arrayToObject": "$countries"
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "$fromEntries": {
    "$map": {
      "over": {
        "$entriesOf": {
          "$groupBy": {
            "over": {
              "$ref": "$.orders"
            },
            "as": "order",
            "key": {
              "$get": {
                "from": {
                  "$var": "order"
                },
                "path": [
                  "customer",
                  "address",
                  "country"
                ]
              }
            }
          }
        }
      },
      "as": "entry",
      "body": [
        {
          "$get": {
            "from": {
              "$var": "entry"
            },
            "path": [
              0
            ]
          }
        },
        {
          "orders": {
            "$length": {
              "$get": {
                "from": {
                  "$var": "entry"
                },
                "path": [
                  1
                ]
              }
            }
          },
          "shippingCents": {
            "$sum": {
              "over": {
                "$pluck": {
                  "over": {
                    "$get": {
                      "from": {
                        "$var": "entry"
                      },
                      "path": [
                        1
                      ]
                    }
                  },
                  "key": "shippingCents"
                }
              }
            }
          }
        }
      ]
    }
  }
}
```

## `screen` — An API answer into a screen model

The paid orders: how many, their revenue, and the twenty newest as rows of { id, buyer, city, totalCents, skus }.

**CEL (@marcbachmann/cel-js)** — not expressible: CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter. The revenue cannot be added up, and a list cannot be sorted.

**GROQ (groq-js)**

```
{"paid": orders[status == "paid"]{..., "totalCents": math::sum(items[]{"cents": qty * unitCents}.cents) + shippingCents}}{"count": count(paid), "revenueCents": math::sum(paid[].totalCents), "rows": paid | order(placedAt desc)[0...20]{id, "buyer": customer.name, "city": customer.address.city, totalCents, "skus": array::join(items[].sku, ", ")}}
```

**A function written by hand**

```
({ orders }) => {
      const paid = orders.filter((order) => order.status === 'paid');
      return {
        count: paid.length,
        revenueCents: paid.reduce((sum, order) => sum + totalCents(order), 0),
        rows: [...paid]
          .sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0))
          .slice(0, 20)
          .map((order) => ({
            id: order.id,
            buyer: order.customer.name,
            city: order.customer.address.city,
            totalCents: totalCents(order),
            skus: order.items.map((item) => item.sku).join(', '),
          })),
      };
    }
```

**JMESPath (jmespath.js)** — not expressible: JMESPath has no arithmetic: nothing multiplies qty by unitCents or adds shipping to a sum.

**JMESPath Community**

```
let $paid = orders[?status == 'paid'] in {
  count: length($paid),
  revenueCents: sum(map(&(sum(map(&(qty * unitCents), items)) + shippingCents), $paid)),
  rows: reverse(sort_by($paid, &placedAt))[:20].{
    id: id,
    buyer: customer.name,
    city: customer.address.city,
    totalCents: sum(map(&(qty * unitCents), items)) + shippingCents,
    skus: join(', ', items[*].sku)
  }
}
```

**Jora**

```
$paid: orders.[status = "paid"]; $total: => items.sum(=> qty * unitCents) + shippingCents; { count: $paid.size(), revenueCents: $paid.sum($total) ?? 0, rows: $paid.sort(placedAt desc)[0:20].({ id, buyer: customer.name, city: customer.address.city, totalCents: $total(), skus: items.(sku).join(", ") }) }
```

**jq (jq-wasm)**

```
def total: (.items | map(.qty * .unitCents) | add) + .shippingCents; [.orders[] | select(.status == "paid")] as $paid | {count: ($paid | length), revenueCents: ($paid | map(total) | add // 0), rows: ($paid | sort_by(.placedAt) | reverse | .[:20] | map({id, buyer: .customer.name, city: .customer.address.city, totalCents: total, skus: (.items | map(.sku) | join(", "))}))}
```

**JSON-e**

```json
{
  "$let": {
    "paid": {
      "$map": {
        "$eval": "orders"
      },
      "each(order)": {
        "$if": "order.status == 'paid'",
        "then": {
          "$eval": "order"
        }
      }
    }
  },
  "in": {
    "count": {
      "$eval": "len(paid)"
    },
    "revenueCents": {
      "$reduce": {
        "$eval": "paid"
      },
      "initial": 0,
      "each(revenue, order)": {
        "$let": {
          "lines": {
            "$reduce": {
              "$eval": "order.items"
            },
            "initial": 0,
            "each(sum, item)": {
              "$eval": "sum + item.qty * item.unitCents"
            }
          }
        },
        "in": {
          "$eval": "revenue + lines + order.shippingCents"
        }
      }
    },
    "rows": {
      "$let": {
        "sorted": {
          "$reverse": {
            "$sort": {
              "$eval": "paid"
            },
            "by(order)": "order.placedAt"
          }
        }
      },
      "in": {
        "$map": {
          "$eval": "sorted[0:20]"
        },
        "each(order)": {
          "id": {
            "$eval": "order.id"
          },
          "buyer": {
            "$eval": "order.customer.name"
          },
          "city": {
            "$eval": "order.customer.address.city"
          },
          "totalCents": {
            "$let": {
              "lines": {
                "$reduce": {
                  "$eval": "order.items"
                },
                "initial": 0,
                "each(sum, item)": {
                  "$eval": "sum + item.qty * item.unitCents"
                }
              }
            },
            "in": {
              "$eval": "lines + order.shippingCents"
            }
          },
          "skus": {
            "$let": {
              "skus": {
                "$map": {
                  "$eval": "order.items"
                },
                "each(item)": {
                  "$eval": "item.sku"
                }
              }
            },
            "in": {
              "$eval": "join(skus, ', ')"
            }
          }
        }
      }
    }
  }
}
```

**json-logic-engine (interpreted)** — not expressible: No operator sorts a list, and none takes its first n.

**json-logic-engine (build)** — not expressible: No operator sorts a list, and none takes its first n.

**JsonLogic (json-logic-js)** — not expressible: JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).

**JSONata**

```
(
  $paid := orders[status = "paid"];
  {
    "count": $count($paid),
    "revenueCents": $sum([$paid.($sum(items.(qty * unitCents)) + shippingCents)]),
    "rows": [$paid^(>placedAt)[[0..19]].{
      "id": id,
      "buyer": customer.name,
      "city": customer.address.city,
      "totalCents": $sum(items.(qty * unitCents)) + shippingCents,
      "skus": $join(items.sku, ", ")
    }]
  }
)
```

**JSON Query (JSON format)**

```json
[
  "pipe",
  [
    "get",
    "orders"
  ],
  [
    "filter",
    [
      "eq",
      [
        "get",
        "status"
      ],
      "paid"
    ]
  ],
  [
    "object",
    {
      "count": [
        "size"
      ],
      "revenueCents": [
        "pipe",
        [
          "map",
          [
            "add",
            [
              "pipe",
              [
                "get",
                "items"
              ],
              [
                "map",
                [
                  "multiply",
                  [
                    "get",
                    "qty"
                  ],
                  [
                    "get",
                    "unitCents"
                  ]
                ]
              ],
              [
                "sum"
              ]
            ],
            [
              "get",
              "shippingCents"
            ]
          ]
        ],
        [
          "sum"
        ]
      ],
      "rows": [
        "pipe",
        [
          "sort",
          [
            "get",
            "placedAt"
          ],
          "desc"
        ],
        [
          "limit",
          20
        ],
        [
          "map",
          [
            "object",
            {
              "id": [
                "get",
                "id"
              ],
              "buyer": [
                "get",
                "customer",
                "name"
              ],
              "city": [
                "get",
                "customer",
                "address",
                "city"
              ],
              "totalCents": [
                "add",
                [
                  "pipe",
                  [
                    "get",
                    "items"
                  ],
                  [
                    "map",
                    [
                      "multiply",
                      [
                        "get",
                        "qty"
                      ],
                      [
                        "get",
                        "unitCents"
                      ]
                    ]
                  ],
                  [
                    "sum"
                  ]
                ],
                [
                  "get",
                  "shippingCents"
                ]
              ],
              "skus": [
                "pipe",
                [
                  "get",
                  "items"
                ],
                [
                  "map",
                  [
                    "get",
                    "sku"
                  ]
                ],
                [
                  "join",
                  ", "
                ]
              ]
            }
          ]
        ]
      ]
    }
  ]
]
```

**JSON Query (text format)**

```
.orders
  | filter(.status == "paid")
  | {
    count: size(),
    revenueCents: map((.items | map(.qty * .unitCents) | sum()) + .shippingCents) | sum(),
    rows: sort(.placedAt, "desc") | limit(20) | map({
      id: .id,
      buyer: .customer.name,
      city: .customer.address.city,
      totalCents: (.items | map(.qty * .unitCents) | sum()) + .shippingCents,
      skus: .items | map(.sku) | join(", ")
    })
  }
```

**lodash**

```
({ orders }) => {
    const paid = _.filter(orders, { status: 'paid' });
    return {
      count: paid.length,
      revenueCents: _.sumBy(paid, totalCents),
      rows: _.map(_.take(_.orderBy(paid, 'placedAt', 'desc'), 20), (order) => ({
        id: order.id,
        buyer: order.customer.name,
        city: order.customer.address.city,
        totalCents: totalCents(order),
        skus: _.join(_.map(order.items, 'sku'), ', '),
      })),
    };
  }
```

**mingo (aggregation pipeline)** (glue: input.orders is handed over as the collection and the one resulting document is unwrapped.)

```json
[
  {
    "$match": {
      "status": "paid"
    }
  },
  {
    "$facet": {
      "summary": [
        {
          "$group": {
            "_id": null,
            "count": {
              "$sum": 1
            },
            "revenueCents": {
              "$sum": {
                "$add": [
                  {
                    "$sum": {
                      "$map": {
                        "input": "$items",
                        "as": "item",
                        "in": {
                          "$multiply": [
                            "$$item.qty",
                            "$$item.unitCents"
                          ]
                        }
                      }
                    }
                  },
                  "$shippingCents"
                ]
              }
            }
          }
        }
      ],
      "rows": [
        {
          "$sort": {
            "placedAt": -1
          }
        },
        {
          "$limit": 20
        },
        {
          "$project": {
            "_id": 0,
            "id": "$id",
            "buyer": "$customer.name",
            "city": "$customer.address.city",
            "totalCents": {
              "$add": [
                {
                  "$sum": {
                    "$map": {
                      "input": "$items",
                      "as": "item",
                      "in": {
                        "$multiply": [
                          "$$item.qty",
                          "$$item.unitCents"
                        ]
                      }
                    }
                  }
                },
                "$shippingCents"
              ]
            },
            "skus": {
              "$reduce": {
                "input": "$items.sku",
                "initialValue": "",
                "in": {
                  "$concat": [
                    "$$value",
                    {
                      "$cond": [
                        {
                          "$eq": [
                            "$$value",
                            ""
                          ]
                        },
                        "",
                        ", "
                      ]
                    },
                    "$$this"
                  ]
                }
              }
            }
          }
        }
      ]
    }
  },
  {
    "$project": {
      "count": {
        "$ifNull": [
          {
            "$first": "$summary.count"
          },
          0
        ]
      },
      "revenueCents": {
        "$ifNull": [
          {
            "$first": "$summary.revenueCents"
          },
          0
        ]
      },
      "rows": 1
    }
  }
]
```

**Prism (compile, execute)**

```json
{
  "$with": {
    "let": {
      "paid": {
        "$filter": {
          "over": {
            "$ref": "$.orders"
          },
          "as": "order",
          "when": {
            "$eq": [
              {
                "$get": {
                  "from": {
                    "$var": "order"
                  },
                  "path": [
                    "status"
                  ]
                }
              },
              "paid"
            ]
          }
        }
      }
    },
    "value": {
      "count": {
        "$length": {
          "$var": "paid"
        }
      },
      "revenueCents": {
        "$sum": {
          "over": {
            "$map": {
              "over": {
                "$var": "paid"
              },
              "as": "order",
              "body": {
                "$add": [
                  {
                    "$sum": {
                      "over": {
                        "$map": {
                          "over": {
                            "$get": {
                              "from": {
                                "$var": "order"
                              },
                              "path": [
                                "items"
                              ]
                            }
                          },
                          "as": "item",
                          "body": {
                            "$mul": [
                              {
                                "$get": {
                                  "from": {
                                    "$var": "item"
                                  },
                                  "path": [
                                    "qty"
                                  ]
                                }
                              },
                              {
                                "$get": {
                                  "from": {
                                    "$var": "item"
                                  },
                                  "path": [
                                    "unitCents"
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  {
                    "$get": {
                      "from": {
                        "$var": "order"
                      },
                      "path": [
                        "shippingCents"
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      "rows": {
        "$map": {
          "over": {
            "$take": {
              "from": {
                "$sortBy": {
                  "over": {
                    "$var": "paid"
                  },
                  "as": "order",
                  "by": {
                    "$get": {
                      "from": {
                        "$var": "order"
                      },
                      "path": [
                        "placedAt"
                      ]
                    }
                  },
                  "dir": "desc"
                }
              },
              "count": 20
            }
          },
          "as": "order",
          "body": {
            "id": {
              "$get": {
                "from": {
                  "$var": "order"
                },
                "path": [
                  "id"
                ]
              }
            },
            "buyer": {
              "$get": {
                "from": {
                  "$var": "order"
                },
                "path": [
                  "customer",
                  "name"
                ]
              }
            },
            "city": {
              "$get": {
                "from": {
                  "$var": "order"
                },
                "path": [
                  "customer",
                  "address",
                  "city"
                ]
              }
            },
            "totalCents": {
              "$add": [
                {
                  "$sum": {
                    "over": {
                      "$map": {
                        "over": {
                          "$get": {
                            "from": {
                              "$var": "order"
                            },
                            "path": [
                              "items"
                            ]
                          }
                        },
                        "as": "item",
                        "body": {
                          "$mul": [
                            {
                              "$get": {
                                "from": {
                                  "$var": "item"
                                },
                                "path": [
                                  "qty"
                                ]
                              }
                            },
                            {
                              "$get": {
                                "from": {
                                  "$var": "item"
                                },
                                "path": [
                                  "unitCents"
                                ]
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                },
                {
                  "$get": {
                    "from": {
                      "$var": "order"
                    },
                    "path": [
                      "shippingCents"
                    ]
                  }
                }
              ]
            },
            "skus": {
              "$join": {
                "parts": {
                  "$pluck": {
                    "over": {
                      "$get": {
                        "from": {
                          "$var": "order"
                        },
                        "path": [
                          "items"
                        ]
                      }
                    },
                    "key": "sku"
                  }
                },
                "sep": ", "
              }
            }
          }
        }
      }
    }
  }
}
```
