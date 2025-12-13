# 📦 1. Overview

This document explains how a Tradera-style auction system works, including:
	•	Proxy bidding (max bid)
	•	Second-price logic
	•	Hard close (no time extension)
	•	Reserve price behavior
	•	Buy Now interactions
	•	All major edge cases
	•	Backend bid logs (true max bids)
	•	Frontend-visible bid history (what users actually see)


# 📦 2. Core Concepts

✔ Max Bid (Proxy Bid)

Users enter the maximum amount they are willing to pay.
The system automatically bids the minimum amount needed to keep them winning.

✔ Second-Price Logic

Winning price is usually:

```second-highest max bid + bid increment```

At any moment, the visible price is:
```
min(
  winner_max,
  loser_max + increment
)
```
✔ Bid Increments

Fixed steps depending on price range (e.g., +10, +20, +50 SEK). TBD.. 

✔ Hidden Max Bids

Users never see each other’s max bid.

✔ Automatic Bidding

The system automatically increases the visible price when challenged.

✔ Hard Close

Auction ends exactly at its end time (no extension).

# 📦 3. Scenarios 

## Scenarios 1 – Standard Auction (No Reserve)

Example:
```
	•	Start price: 100
	•	Increment: 10
	•	A max = 200
	•	B max = 120
	•	C max = 300
```
Step 1 User A sets max 200
```
Backend reasoning
	•	A is the first bidder
	•	To become leader, the system must place a real bid
	•	Minimum real bid = start price + increment => 100 + 10 = 110
```
Backend Log
```
A submitted max=200
System placed bid at 110 (first valid bid)
```
Frontend
```
10:00  User A auto-bid to 110 (leading)
```

Step 2 User B sets max 120
```
•	A’s max is higher → A must stay leader
•	To beat B, A only needs to bid just above B’s max => B max + increment = 120 + 10 = 130
```

Result
```
	•	Leader: A
	•	Visible price increases to 130
```

Frontend
```
12:00  User A auto-bid to 130 (leading)
10:00  User A auto-bid to 110
```
❗ Notice:
```
	•	You do NOT show “User B placed 120” publicly
	•	B sees a private message: “You’ve been outbid”
```

Step 3 User C set max 300
```
	•	C’s max is higher → C becomes leader
	•	C only needs to beat A’s max by one increment => A max + increment = 200 + 10 = 210
```

Frontend
```
14:00  User C auto-bid to 210 (leading)
12:00  User A auto-bid to 130
10:00  User A auto-bid to 110
```

Outcome

Winner: C
Final price: 210 (not 300)

Edge case, to be more clear
```
	•	Start price: 100
	•	Increment: 10
	•	Only A max = 200
```
A wins at 110

The system must place the LOWEST VALID BID on behalf of A.

in proxy bidding systems:
```
	•	The starting price is not a bid from any user
	•	The system must create A’s first actual bid
	•	The first actual bid is always: Starting price + minimum increment
```

Frontend (User-Visible Bid History)
```
10:00  User A auto-bid to 110 (leading)
```

## 📦 Scenario 2 – Reserve Price Not Met → Unsold

Example:
```
	•	Start: 1
	•	Reserve: 1000
	•	Increase: 10
	•	A max = 300
	•	B max = 800
```

Step 1 A set max 300

Backend Logic
```
	•	First bidder → must place a real bid
	•	Minimum real bid = start + increment => 1 + 10 = 11
```
Frontend
```
10:00  User A auto-bid to 11 kr (leading)
```
Step 2 B set max 800

Price = loser’s max + increment => 300 + 10 = 310

Frontend
```
12:00  User B auto-bid to 310 kr (leading)
10:00  User A auto-bid to 11 kr
```
Frontend will also shows: **Reserve price not met**

Final result (Tradera)
	•	❌ No winner
	•	❌ No sale
	•	Auction marked Unsold


## 📦 Scenario 3 – Buy Now + Auction

🔒 Rule 1 — Auction WITHOUT reserve price

Buy now is removed immediately when the first bid is placed
It does not matter how small the bid is.


🔒 Rule 2 — Auction WITH reserve price

Buy now is removed only when the reserve price is met

Important:
	•	Placing a bid does NOT automatically remove Buy now button
	•	Buy now stays visible until a max bid ≥ reserve
	•	When reserve is met, price may jump up to the reserve
	•	At that exact moment → Buy now is removed

🔒 Rule 3 — Clicking Buy Now

Clicking Buy now immediately:

	•	Ends the auction
	•	Sets the final price to Buy now
	•	Ignores reserve (Buy now always satisfies seller’s minimum)

Scenario — Buy Now WITH reserve
```
	•	Start price 10
	•	Increase = 10
	•	Reserve price 300
	•	Buy now price 500
```

Step 0 - Auction starts
```
Visible price: 0
Reserve: not met
Buy Now: 500 (VISIBLE)
```

Step 1 - A set max 200
```
First bidder → price increases by one increment => 10 + 10 = 20
	•	A max (200) < reserve (300)
	•	Reserve NOT met
```

```
Visible price: 20
Leader: A
Reserve met? ❌ No
Buy Now: ✔ STILL VISIBLE
----------------------------
Current bid: 20 kr
Reserve price not met
Buy it now: 500 kr
```

Step 2 - B set max 400
```
Normal proxy result, A max + increase = 200 + 10 = 210 
But now check reserve:
	•	B max (400) ≥ reserve (300)

👉 Tradera rule triggers here:

**If a max bid meets or exceeds the reserve,
and the calculated price is below reserve,
raise visible price to the reserve.**


So price become => Visible price = 300

At the exact moment reserve is met:
Buy Now is REMOVED
```

Final state after step 2
```
Visible price: 300
Leader: B
Reserve met: ✔ YES
Buy Now: ❌ REMOVED
-----------------------------
Frontend history
12:00  User B auto-bid to 300 kr (leading)
10:00  User A auto-bid to 10 kr
-----------------------------
UI message:
Reserve price met
Buy it now is no longer available
```

Step 3 — Auction continues normally
```
From now on:
	•	No Buy Now
	•	Pure auction logic
	•	Proxy bidding continues as usual

If auction ends now:
	•	Winner: B
	•	Price: 300
```


Scenario — Buy Now WITHOUT reserve
```
	•	Start price 10
	•	Increase = 10
	•	Reserve price NONE
	•	Buy now price 500
```
Step 1 - A set max 200
```
First bidder → price increases by one increment => 10 + 10 = 20
Immediately **Buy Now REMOVED**
```

Frontend
```
Current bid: 20 kr
Buy it now: ❌ no longer available
```

```
Auction type      When is Buy now removed?
No reserve        First bid placed
Has reserve       When reserve is met
Buy now clicked   Immediately, auction ends
```

## 📦 Scenario 4 – Two Users Place the Same Max Bid Simultaneously

Example:
```
	•	Start = 100
	•	Increase = 10
	•	A max = 200
	•	B max = 200
	•	A’s request arrives first
```

Step 1 A set max 200

```
Backend
10:00:01.001  A submits max=200
10:00:01.001  System sets visible price to 110
-----------------------------------------------
Frontend
10:00:01  User A auto-bid to 110 (leading)
```

Step 2 B set max 200

Reasoning:
```
	•	Max bids are equal
	•	Earlier bidder wins (A)
	•	Does A need to raise price to beat B? → No
	•	A already leads at 110, which is the lowest possible winning price

Result
	•	Leader stays: A
	•	Visible price stays: 110
	•	B is outbid instantly, he will get message
```

```
Backend
10:00:01.002  B submits max=200
10:00:01.002  Compared with A max=200 → A wins by timestamp
10:00:01.002  No price change
-----------------------------------------------
Frontend
10:00:01  User A auto-bid to 110 (leading) -> Only see this -> ❗ No extra lines, no “User B placed 200”.
```

Final: A leads at 110

## 📦 Scenario 5 – User Raises Their Own Max Bid

Rule for raising your own max bid
```
Increasing your own max bid NEVER changes the visible price unless there is an active competing max bid that forces it up.

Key implications:
	1.	The visible price is determined only by competition
	2.	Your own max is just a ceiling, not a bid
	3.	If no one is pushing against you, price stays exactly the same
```

Example:
```
	•	Start = 10
	•	Increase = 10
	•	Current price = 560
	•	A max = 550
	•	B max = 600
	•	Current leader = B
```

As usual bidding
```
10:05  User B auto-bid to 560 kr (leading)
10:00  User A auto-bid to 20 kr
```

Branch 1 — A raises their max (loser increases max)
	
A raises max from 550 → 650 at 10:10.
Now A should become the new leader => 600 + 10 => 610

```
10:10  User A auto-bid to 610 kr (leading)
10:05  User B auto-bid to 560 kr
10:00  User A auto-bid to 20 kr
```

 Branch 2 — B raises their own max (leader increases max)

 Back to the original state
 ```
	•	Start = 10
	•	Increase = 10
	•	Current price = 560
	•	A max = 550
	•	B max = 600
	•	Current leader = B
-------------------------------------------------
B increases their max from 600 → 800
so 
	•	Leader: still B
	•	Visible price: still 560
Nothing will change in Frontend but only changed B's max in backend
```

## 📦 Scenario 6 – Multiple Max Bid Battles (Continuous Raising)

Action Sequence:
```
    Starting price 100
	Increase 10
	1.	A max = 200
	2.	B max = 250
	3.	A raises max → 300
	4.	B raises max → 350
	5.	A raises max → 360
	6.	B raises max → 400
```

Backend Log
```
Time User 	Max 	Visible Price
10:00 	A 	200 	110
10:10 	B 	250 	210
10:15 	A 	300 	260
10:20 	B 	350		310
10:25 	A 	360 	360
10:30 	B 	400 	370
```
```
10:30  User B auto-bid to 370 (leading)
10:25  User A auto-bid to 360
10:20  User B auto-bid to 310
10:15  User A auto-bid to 260
10:10  User B auto-bid to 210
10:00  User A auto-bid to 110
```

🔁 Rebuild this scenario from scratch

```
Step-by-step backend logic

1️⃣ 10:00 — A sets max = 200
	•	Start price = 100
	•	First real bid must be: 100 + 10 = 110
	•	A leads at 110

2️⃣ 10:10 — B sets max = 250

Now compare:
	•	A max = 200
	•	B max = 250 → B wins
	•	Visible price = loser’s max + increment = 200 + 10 = 210
	•	B leads at 210

3️⃣ 10:15 — A raises max to 300

Compare:
	•	A max = 300
	•	B max = 250 → A wins
	•	Visible price = loser’s max + increment = 250 + 10 = 260
	•	A leads at 260

4️⃣ 10:20 — B raises max to 350

Compare:
	•	A max = 300
	•	B max = 350 → B wins
	•	Visible price = 300 + 10 = 310
	•	B leads at 310

5️⃣ 10:25 — A raises max to 360

Compare:
	•	A max = 360
	•	B max = 350 → A wins
	•	Visible price = 350 + 10 = 360 but that 360 equals A max – that’s fine. (Using the same rule: loser’s max + increment.)
	•	A leads at 360

6️⃣ 10:30 — B raises max to 400

Compare:
	•	A max = 360
	•	B max = 400 → B wins
	•	Visible price = 360 + 10 = 370
	•	B leads at 370

So the final state is:
	•	Winner: B
	•	Final price: 370
```

Only show price changes (simpler, what most sites do)

Then the public bid history would be:
```
10:30  User B auto-bid to 370 (leading)
10:25  User A auto-bid to 360
10:20  User B auto-bid to 310
10:15  User A auto-bid to 260
10:10  User B auto-bid to 210
10:00  User A auto-bid to 110
```
Here:
```
	•	Every line corresponds to a visible price change.
	•	You don’t separately show “User X changed their max”; that’s implied by the auto-bid.
```

## 📦 Scenario 7 – Last-Second Sniping (Multiple Users)

```
Example:
	•	Current = 970
	•	Increase 10
	•	A max = 1300
	•	Leader A
---------------------------------------
Now Snipers coming
	•	B max = 1330 (arrives earlier)
	•	C max = 1400 (arrives later)
```

Backend Log
```
Time User Max Visible Price
19:59:59.100 B 1330 Auto-bid → 1310
19:59:59.300 C 1400 Auto-bid → 1340
```

Frontend History
```
19:59:59 User C auto-bid to 1340 (leading)
19:59:59 User B auto-bid to 1310
18:00    User A auto-bid to 970
```

Winner: C

## 📦 Scenario 8 – Winner Does Not Pay → Second Chance Offer

Backend states:
```
Status				  	Meaning
awaiting_payment 	   	Winner must pay
overdue Winner failed  	second_chance Offer sent to next bidders
```

Frontend:
```
The winner did not complete payment.
Would you like to offer the item to another bidder?
```

Other bidders receive:
```
You have a second-chance offer at 210 kr.
```
