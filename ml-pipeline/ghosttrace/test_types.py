from graph_encoder import encode_node_type, NODE_TYPE_TO_ID

print("NODE_TYPE_TO_ID mapping:")
print(NODE_TYPE_TO_ID)
print()

test_nodes = [
    {'id': '1', 'data': {'label': 'API Gateway',    'type': 'Gateway'}},
    {'id': '2', 'data': {'label': 'Service A',      'type': 'Service'}},
    {'id': '3', 'data': {'label': 'Infrastructure', 'type': 'Infrastructure'}},
    {'id': '4', 'data': {'label': 'PostgreSQL',     'type': 'PostgreSQL'}},
    {'id': '5', 'data': {'label': 'Cache',          'type': 'Cache'}},
    {'id': '6', 'data': {'label': 'RabbitMQ',       'type': 'RabbitMQ'}},
    {'id': '7', 'data': {'label': 'Edge Network',   'type': 'Edge Network'}},
    {'id': '8', 'data': {'label': 'Background Job', 'type': 'Background Job'}},
]

for n in test_nodes:
    result = encode_node_type(n)
    print(f"{n['data']['type']:20s} -> {result}")