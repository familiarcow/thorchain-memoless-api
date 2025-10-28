This is an integration guide for how to use the Memoless API as a consumer.
This service is meant to be consumed by frontends wanting to provide their users with THORChain Memoless V1 functionality. This document will cover the flow that a wallet or fronten should use.

How to use this API for swaps:

1) Get a quote from THORChain using thornode quote endpoint: https://dev.thorchain.org/swap-guide/quickstart-guide.html. This example will use a swap of 0.001 ETH.ETH to to BTC.BTC

2) User should accept the quote output. User should see the "expected_amount_out"
    - Your app should log the `from_asset` (The one that they will send to THORChain)
    - Your app should log the `memo` field. This is the swap or deposit memo
    - Keep track of the `amount` that the user is trying to swap. We can use it later to get a suggested memoless swap amount.

3) Verify that the from_asset is a valid memoless asset using `/api/v1/assets/{from_asset}`
    - If "Success" = false, the user cannot use this assset for a Memoless deposit. Only gas assets can be used for Memoless at this time.
    - If "success" = true, proceed to register your memo onchain
        - The endpoint will also output useful information for the from_asset, which may be useful to you

4) Register the memo by calling `/api/v1/register` with the above `from_asset` and `memo`
    - Example call: 
            curl -X 'POST' \
            'http://localhost:8080/api/v1/register' \
            -H 'accept: application/json' \
            -H 'Content-Type: application/json' \
            -d '{
            "asset": "BTC.BTC",
            "memo": "=:ETH.ETH:0x742d35Cc6634C0532925a3b8D121C2c6C9b8DC8E:0/1/0",
            "requested_in_asset_amount": "1"
            }'

    - Sample response data:
        {
        "success": true,
        "internal_api_id": "759469128f21f20ad4e70367743e1609",
        "asset": "BTC.BTC",
        "memo": "=:ETH.ETH:0x742d35Cc6634C0532925a3b8D121C2c6C9b8DC8E:0/1/0:sthor1g6pnmnyeg48yc3lg796plt0uw50qpp7humfggz:5",
        "reference": "00042",
        "reference_length": 5,
        "height": "6806547",
        "registration_hash": "6BE9138BAA978F2EC97C8E0624E410DC6DC92545FDDE988A6587899D6FEF56E8",
        "registered_by": "sthor1g6pnmnyeg48yc3lg796plt0uw50qpp7humfggz",
        "txHash": "6BE9138BAA978F2EC97C8E0624E410DC6DC92545FDDE988A6587899D6FEF56E8",
        "decimals": 8,
        "minimum_amount_to_send": "0.00100042",
        "suggested_in_asset_amount": "1.00000042"
        }

    - Some things to note about the response:
        - The .env has a thorname & fee set, so because the app detects that the action is a swap, it automatically injects the address & fee into the registered memo
        - For swaps, it is suggested to use the `amount/1e8` you used in the thornode quote from earlier as the `requested_in_asset_amount. Remember that thornode uses base units, but this will take the amount in normalized units, so divide your thornode quote request amount by 1e8
            - This will give you a "suggested_in_asset_amount". This is your input amount with the reference ID appended onto it in the proper position to be recognized by thorchain. It will round up if needed, so it will always be slightly greater than the amount the user originally requested a quote for.
            - You can use the "suggested_in_asset_amount" going forward, or you can construct your own "amount" to send using the data in this reponse
        - You get a `minimum_amount_to_send`. This is the absolute minimum that the user can send to THORChain to get recognized by the network. Notice that the last `reference_length` digits of the amount are the the `reference number`. This is how the memoless protocol works.

    - To construct your own valid `amount` to use in the memoless protocol, do the following:
        - Note the "decimals", "reference length", and "reference number"
        - Whole numbers don't matter at all, only the decimals
        - Anything beyond the decimals defined in `decimals` will be ignored. Do not ever round, just ignore.
        - The `reference_number` must be the last `reference_length` decimals, ending at the `decimals` decimal.

        - Examples:
            - Reference Number: `00008`, Reference Length: `5`, Decimals: `8`
                - Amount can be xxxx.xxx00008
                - VALID: 1.000000008, 0.00100008
                - INVALID: 0.00010008 (the last `5` decimals do not == the `reference_number`)
            - Reference Number: `12345`, Reference Length: `5`, Decimals: `6`
                - Amount can be xxxx.x12345
                - VALID: 99999999.912345
                - INVALID: 99.99912345 (total decimals is `7`, greater than `6`)
                - INVALID: 99.12345 (the last `5` decimals are `23450` which is a mismatch to `12345`)

5) Construct a valid `amount` to use in the preflight check, or use the `suggested_in_asset_amount` if you provided a `requested_in_amount` in the registration.

6) Do a preflight check. This will double check that your amount will be considered valid by THORChain and give you the data you need to give to the user. It is recommended to use the `asset` and `reference number` in the preflight request, rather than the `internal_api_id`, but that can be used instead.

```
curl -X 'POST' \
  'http://localhost:8080/api/v1/preflight' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "asset": "BTC.BTC",
  "reference": "00042",
  "amount": "1.00000042",
  "inputType": "asset"
}'
```
Response:
```
{
  "success": true,
  "message": "Preflight check passed - proceed with transaction",
  "data": {
    "current_uses": 0,
    "max_uses": 3,
    "memo": "=:ETH.ETH:0x742d35Cc6634C0532925a3b8D121C2c6C9b8DC8E:0/1/0:sthor1g6pnmnyeg48yc3lg796plt0uw50qpp7humfggz:5",
    "inbound_address": "bc1qy3ernvkdrlqrx7xcgexdj3d2hxc8h7vg672mfk",
    "qr_code": "bitcoin:bc1qy3ernvkdrlqrx7xcgexdj3d2hxc8h7vg672mfk?amount=1.00000042",
    "qr_code_data_url": "data:image/png;base64,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",
    "time_remaining": "5h",
    "blocks_remaining": 3410,
    "seconds_remaining": 20460
  }
}
```

If the preflight passes `"success" = true`, then you are greenlit to send EXACTLY the `amount` to the `inbound_address`. This response will also give you a QR code with the address & amount encoded for the chain you need to make the deposit on. Ensure that the user is sending the correct asset & amount on the correct network. There is a maximum number of uses for the deposit details, as well as an expiry, all of which can be checked using this endpoint. 

You can ask your user for their transaction ID and check their transaction's status via THORNode. Remember to strip the `0x` off any EVM deposits when tracking. 

Always run a preflight before having users send in funds, since this will double check all of the details so their swap isn't accidentally lost. Any sends on the incorrect network, incorrect amount, or incorrect asset are likely irreversibly lost.

If the preflight fails, DO NOT PROCEED WITH THE SWAP. It probably means your `amount` is wrong. Double check your `amount` logic, or use our built in tools to construct the amount for you.
