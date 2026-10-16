"""Measure retrieval and answer quality against a small labelled question set.

Usage (after uploading your test documents through the app):
  python eval/run_eval.py --email you@example.com --password '...' --questions eval/questions.json

For each question we report:
  retrieval hit  - an expected phrase appears in one of the top-k retrieved chunks
  answer hit     - an expected phrase appears in the model's answer
"""
import argparse
import json

import httpx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--questions", default="eval/questions.json")
    ap.add_argument("--k", type=int, default=6)
    args = ap.parse_args()

    http = httpx.Client(base_url=args.base, timeout=120)
    token = http.post("/auth/login", json={"email": args.email, "password": args.password}).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    questions = json.load(open(args.questions))
    ret_hits = ans_hits = 0
    for q in questions:
        expect = [e.lower() for e in q["expect"]]

        chunks = http.post("/search", json={"query": q["question"], "k": args.k}, headers=auth).json()
        ret_ok = any(e in c["content"].lower() for c in chunks for e in expect)

        answer = ""
        with http.stream("POST", "/chat", json={"question": q["question"]}, headers=auth) as r:
            event = None
            for line in r.iter_lines():
                if line.startswith("event: "):
                    event = line[7:]
                elif line.startswith("data: ") and event == "token":
                    answer += json.loads(line[6:])["text"]
        ans_ok = any(e in answer.lower() for e in expect)

        ret_hits += ret_ok
        ans_hits += ans_ok
        print(f"[retrieval {'OK ' if ret_ok else 'MISS'}] [answer {'OK ' if ans_ok else 'MISS'}] {q['question']}")

    n = len(questions) or 1
    print(f"\nRetrieval hit rate@{args.k}: {ret_hits}/{len(questions)} = {ret_hits / n:.0%}")
    print(f"Answer hit rate:           {ans_hits}/{len(questions)} = {ans_hits / n:.0%}")


if __name__ == "__main__":
    main()
