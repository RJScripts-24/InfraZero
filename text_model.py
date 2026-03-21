import requests
import json

# Test 1 — Simple thundering herd topology
payload = {
    "nodes": [
        {"id":"1","data":{"label":"API Gateway","type":"Gateway","processingPowerMs":100,"failureRatePercent":5,"coldStartLatencyMs":200}},
        {"id":"2","data":{"label":"Service A","type":"Service","processingPowerMs":150,"failureRatePercent":8,"coldStartLatencyMs":300}},
        {"id":"3","data":{"label":"Service B","type":"Service","processingPowerMs":150,"failureRatePercent":8,"coldStartLatencyMs":300}},
        {"id":"4","data":{"label":"Service C","type":"Service","processingPowerMs":150,"failureRatePercent":8,"coldStartLatencyMs":300}},
        {"id":"5","data":{"label":"Service D","type":"Service","processingPowerMs":150,"failureRatePercent":8,"coldStartLatencyMs":300}},
        {"id":"6","data":{"label":"Service E","type":"Service","processingPowerMs":150,"failureRatePercent":8,"coldStartLatencyMs":300}}
    ],
    "edges": [
        {"id":"e1","source":"1","target":"2","latencyMs":50,"packetLossPercent":1},
        {"id":"e2","source":"1","target":"3","latencyMs":50,"packetLossPercent":1},
        {"id":"e3","source":"1","target":"4","latencyMs":50,"packetLossPercent":1},
        {"id":"e4","source":"1","target":"5","latencyMs":50,"packetLossPercent":1},
        {"id":"e5","source":"1","target":"6","latencyMs":50,"packetLossPercent":1}
    ]
}

print("="*50)
print("TEST 1 — Thundering Herd (expect high confidence)")
print("="*50)
r = requests.post("http://localhost:8001/predict", json=payload)
result = r.json()
print(f"Predicted:    {result['predictedClass']}")
print(f"Confidence:   {result['confidence']*100:.1f}%")
print(f"Inference:    {result['inferenceTimeMs']}ms")
print(f"Probabilities:")
for cls, prob in result['classProbabilities'].items():
    bar = '█' * int(prob * 30)
    print(f"  {cls:22s} {bar:30s} {prob*100:.1f}%")
