import sys
import argparse
import json
import numpy as np
from pprint import pprint


def calc_balances_from_pmin_pmax(
    rate,
    price,
    min_ratio,
    max_ratio
):

    min_rate = min_ratio * price
    max_rate = max_ratio * price

    ether = (1 / rate) * np.log(price / min_rate)
    tokens = (1 / rate) * (1 / price - 1 / max_rate)
    tokens_in_eth = tokens * price

    print("ether: " + str(ether))
    print("tokens: " + str(tokens))
    print("tokens_in_eth: " + str(tokens_in_eth))

    return ether, tokens


def calc_min_max_ratio_from_balances(
        price,
        rate,
        ether,
        tokens
):

    max_rate = price / (1 - rate * price * tokens)
    min_rate = price / np.exp(rate * ether)
    min_ratio = min_rate / price
    max_ratio = max_rate / price
    print("min_min_ratio: " + str(min_ratio))
    print("max_max_ratio: " + str(max_ratio) + "\n")

    return min_ratio, max_ratio


def calc_rate_from_eth_balance(ether, price, min_ratio):
    min_rate = min_ratio * price
    rate = (1 / ether) * np.log(price / min_rate)
    print("rate: " + str(rate))


def calc_params_from_ratios(
    rate,
    price,
    num_formula_precision_bits,
    max_cap_buy_eth,
    max_cap_sell_eth,
    fee_in_precents,
    min_ratio,
    max_ratio
):

    max_rate = max_ratio * price
    min_rate = min_ratio * price

    _rInFp = rate * (2 ** num_formula_precision_bits)
    _pMinInFp = min_rate * (2 ** num_formula_precision_bits)
    _numFpBits = num_formula_precision_bits
    _maxCapBuyInWei = max_cap_buy_eth * (10 ** 18)
    _maxCapSellInWei = max_cap_sell_eth * (10 ** 18)
    _feeInBps = fee_in_precents * 100
    _maxTokenToEthRateInPrecision = max_rate * (10 ** 18)
    _minTokenToEthRateInPrecision = min_rate * (10 ** 18)

    print("_rInFp: %.0f" % _rInFp)
    print("_pMinInFp: %.0f" % _pMinInFp)
    print("_numFpBits: %.0f" % _numFpBits)
    print("_maxCapBuyInWei: %.0f" % _maxCapBuyInWei)
    print("_maxCapSellInWei: %.0f" % _maxCapSellInWei)
    print("_feeInBps: %.0f" % _feeInBps)
    print("_maxTokenToEthRateInPrecision: %.0f" % _maxTokenToEthRateInPrecision)
    print("_minTokenToEthRateInPrecision: %.0f" % _minTokenToEthRateInPrecision)


def require_args(names, args):
    if not set(names).issubset(args):
        raise ValueError("following parameters are missing from input: " +
                         str(set(names).difference(args)))


parser = argparse.ArgumentParser(
    description='Get automatic market making ("liquidity") parameters.'
)
parser.add_argument(
    '--get',
    choices=[
        'params',
        'inventories',
        'price_changes_boundaries',
        'rate'
    ],
    help='Values to get'
)
parser.add_argument('--input')
args = parser.parse_args()

with open(args.input) as json_data:
    d = json.load(json_data)

    if args.get == 'params':
        require_args([
                "rate",
                "price",
                "num_formula_precision_bits",
                "max_cap_buy_eth",
                "max_cap_sell_eth",
                "fee_in_precents",
                "min_ratio",
                "max_ratio",
                "ether",
                "tokens"
            ],
            d.keys()
        )

        (min_min_ratio, max_max_ratio) = \
            calc_min_max_ratio_from_balances(
                d["price"],
                d["rate"],
                d["ether"],
                d["tokens"]
        )

        if min_min_ratio > d["min_ratio"]:
            raise ValueError(
                "min_min_ratio " + str(min_min_ratio) +
                " > configured min_ratio " + str(d["min_ratio"])
            )

        if max_max_ratio < d["max_ratio"]:
            raise ValueError(
                "max_max_ratio " + str(max_max_ratio) +
                " > configured max_ratio " + str(d["max_ratio"])
            )

        calc_params_from_ratios(
            d["rate"],
            d["price"],
            d["num_formula_precision_bits"],
            d["max_cap_buy_eth"],
            d["max_cap_sell_eth"],
            d["fee_in_precents"],
            d["min_ratio"],
            d["max_ratio"]
        )

    elif args.get == 'price_changes_boundaries':
        require_args([
                "price",
                "rate",
                "ether",
                "tokens"
            ],
            d.keys()
        )

        (min_min_ratio, max_max_ratio) = calc_min_max_ratio_from_balances(
            d["price"],
            d["rate"],
            d["ether"],
            d["tokens"]
        )

    elif args.get == 'inventories':
        require_args([
                "rate",
                "price",
                "min_ratio",
                "max_ratio"
            ],
            d.keys()
        )

        calc_balances_from_pmin_pmax(
            d["rate"],
            d["price"],
            d["min_ratio"],
            d["max_ratio"]
        )

    elif args.get == 'rate':
        require_args([
                "ether",
                "price",
                "min_ratio"
            ],
            d.keys()
        )

        calc_rate_from_eth_balance(d["ether"], d["price"], d["min_ratio"])
