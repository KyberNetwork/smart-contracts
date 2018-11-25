import sys
import argparse
import json
import numpy as np


def print_initial_balances(
    liquidity_rate,
    initial_price,
    min_supported_price_factor,
    max_supported_price_factor
):

    min_supported_price = min_supported_price_factor * initial_price
    max_supported_price = max_supported_price_factor * initial_price

    initial_ether_amount = (1 / liquidity_rate) * np.log(initial_price / min_supported_price)
    initial_token_amount = (1 / liquidity_rate) * (1 / initial_price - 1 / max_supported_price)
    initial_token_amount_in_eth = initial_token_amount * initial_price

    print("initial_ether_amount: " + str(initial_ether_amount))
    print("initial_token_amount: " + str(initial_token_amount))
    print("initial_token_amount_in_eth: " + str(initial_token_amount_in_eth))


def calc_price_factors(
        initial_price,
        liquidity_rate,
        initial_ether_amount,
        initial_token_amount
):

    min_supported_price = initial_price / np.exp(liquidity_rate * initial_ether_amount)
    min_supported_price_factor = min_supported_price / initial_price

    if liquidity_rate * initial_price * initial_token_amount < 1:
        max_supported_price = \
            initial_price / (1 - liquidity_rate * initial_price * initial_token_amount)
        max_supported_price_factor = max_supported_price / initial_price
    else:
        #max_supported_price_factor can not be calculated 
        max_supported_price_factor = 0

    return min_supported_price_factor, max_supported_price_factor


def print_price_factors(
        initial_price,
        liquidity_rate,
        initial_ether_amount,
        initial_token_amount
):

    (min_supported_price_factor, max_supported_price_factor) = calc_price_factors(
        initial_price=initial_price,
        liquidity_rate=liquidity_rate,
        initial_ether_amount=initial_ether_amount,
        initial_token_amount=initial_token_amount,
    )

    print("min_supported_price_factor: " + str(min_supported_price_factor))
    if max_supported_price_factor != 0:
        print("max_supported_price_factor: " + str(max_supported_price_factor))
    else:
        print(
            "max_supported_price_factor is big and can not be calculated. " +
            "initial_token_amount can be decreased to avoid this."
        )


def print_liquidity_rate(initial_ether_amount, initial_price, min_supported_price_factor):
    min_supported_price = min_supported_price_factor * initial_price
    liquidity_rate = (1 / initial_ether_amount) * np.log(initial_price / min_supported_price)
    print("liquidity_rate: " + str(liquidity_rate))


def get_diff_percent(first, second):
    if first == second:
        return 0
    else:
        return (abs(first - second) / first) * 100.0


def validate_params(
    initial_price,
    liquidity_rate,
    initial_ether_amount,
    initial_token_amount,
    min_supported_price_factor,
    max_supported_price_factor
):

    (min_calculated_price_factor, max_calculated_price_factor) = \
        calc_price_factors(
            initial_price=d["initial_price"],
            liquidity_rate=d["liquidity_rate"],
            initial_ether_amount=d["initial_ether_amount"],
            initial_token_amount=d["initial_token_amount"]
    )

    if min_calculated_price_factor > min_supported_price_factor:
        print(
            "Warning! " +
            "min_calculated_price_factor " + str(min_calculated_price_factor) +
            " > configured min_supported_price_factor " + str(d["min_supported_price_factor"])
        )

    if max_calculated_price_factor == 0:
        print(
            "Warning! max_calculated_price_factor is big and can not be calculated. " +
            "initial_token_amount can be decreased to avoid this."
        )
    elif max_calculated_price_factor < max_supported_price_factor:
        print(
            "Warning! " +
            "max_calculated_price_factor " + str(max_calculated_price_factor) +
            " > configured max_supported_price_factor " + str(d["max_supported_price_factor"])
        )

    expected_initial_price = \
        initial_price * min_supported_price_factor * np.exp(liquidity_rate * initial_ether_amount)
    diff_percent = get_diff_percent(expected_initial_price, initial_price)
    if diff_percent > 1.0:
        print(
            "Warning! " +
            "expected_initial_price " + str(expected_initial_price) +
            " different from initial_price " + str(d["initial_price"]) +
            " by " +  str(diff_percent) + "%"
        )

def print_params(
    liquidity_rate,
    initial_price,
    formula_precision_bits,
    max_tx_buy_amount_eth,
    max_tx_sell_amount_eth,
    fee_percent,
    min_supported_price_factor,
    max_supported_price_factor
):

    max_supported_price = max_supported_price_factor * initial_price
    min_supported_price = min_supported_price_factor * initial_price

    _rInFp = liquidity_rate * (2 ** formula_precision_bits)
    _pMinInFp = min_supported_price * (2 ** formula_precision_bits)
    _numFpBits = formula_precision_bits
    _maxCapBuyInWei = max_tx_buy_amount_eth * (10 ** 18)
    _maxCapSellInWei = max_tx_sell_amount_eth * (10 ** 18)
    _feeInBps = fee_percent * 100
    _maxTokenToEthRateInPrecision = max_supported_price * (10 ** 18)
    _minTokenToEthRateInPrecision = min_supported_price * (10 ** 18)

    print("_rInFp: %d" % _rInFp)
    print("_pMinInFp: %d" % _pMinInFp)
    print("_numFpBits: %d" % _numFpBits)
    print("_maxCapBuyInWei: %d" % _maxCapBuyInWei)
    print("_maxCapSellInWei: %d" % _maxCapSellInWei)
    print("_feeInBps: %d" % _feeInBps)
    print("_maxTokenToEthRateInPrecision: %d" % _maxTokenToEthRateInPrecision)
    print("_minTokenToEthRateInPrecision: %d" % _minTokenToEthRateInPrecision)


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
        'initial_balances',
        'supported_price_factors',
        'liquidity_rate'
    ],
    help='Values to get'
)
parser.add_argument('--input')
args = parser.parse_args()

with open(args.input) as json_data:
    d = json.load(json_data)

    if args.get == 'params':
        require_args([
                "liquidity_rate",
                "initial_price",
                "formula_precision_bits",
                "max_tx_buy_amount_eth",
                "max_tx_sell_amount_eth",
                "fee_percent",
                "min_supported_price_factor",
                "max_supported_price_factor",
                "initial_ether_amount",
                "initial_token_amount"
            ],
            d.keys()
        )

        validate_params(
            liquidity_rate=d["liquidity_rate"],
            initial_price=d["initial_price"],
            initial_ether_amount=d["initial_ether_amount"],
            initial_token_amount=d["initial_token_amount"],
            min_supported_price_factor=d["min_supported_price_factor"],
            max_supported_price_factor=d["max_supported_price_factor"]
        )

        print_params(
            liquidity_rate=d["liquidity_rate"],
            initial_price=d["initial_price"],
            formula_precision_bits=d["formula_precision_bits"],
            max_tx_buy_amount_eth=d["max_tx_buy_amount_eth"],
            max_tx_sell_amount_eth=d["max_tx_sell_amount_eth"],
            fee_percent=d["fee_percent"],
            min_supported_price_factor=d["min_supported_price_factor"],
            max_supported_price_factor=d["max_supported_price_factor"]
        )

    elif args.get == 'supported_price_factors':
        require_args([
                "initial_price",
                "liquidity_rate",
                "initial_ether_amount",
                "initial_token_amount"
            ],
            d.keys()
        )

        print_price_factors(
            initial_price=d["initial_price"],
            liquidity_rate=d["liquidity_rate"],
            initial_ether_amount=d["initial_ether_amount"],
            initial_token_amount=d["initial_token_amount"],
        )

    elif args.get == 'initial_balances':
        require_args([
                "liquidity_rate",
                "initial_price",
                "min_supported_price_factor",
                "max_supported_price_factor"
            ],
            d.keys()
        )

        print_initial_balances(
            liquidity_rate=d["liquidity_rate"],
            initial_price=d["initial_price"],
            min_supported_price_factor=d["min_supported_price_factor"],
            max_supported_price_factor=d["max_supported_price_factor"]
        )

    elif args.get == 'liquidity_rate':
        require_args([
                "initial_ether_amount",
                "initial_price",
                "min_supported_price_factor"
            ],
            d.keys()
        )

        print_liquidity_rate(
            initial_ether_amount=d["initial_ether_amount"],
            initial_price=d["initial_price"],
            min_supported_price_factor=d["min_supported_price_factor"]
        )
