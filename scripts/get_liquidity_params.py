import numpy as np


class LiquidityParams:

    def __init__(self,
                 rate,
                 P_0_tokens_to_eth,
                 num_formula_precision_bits,
                 max_cap_buy_eth,
                 max_cap_sell_eth,
                 fee_in_precents):

        self.rate = rate 
        self.P_0_tokens_to_eth = P_0_tokens_to_eth
        self.num_formula_precision_bits = num_formula_precision_bits
        self.max_cap_buy_eth= max_cap_buy_eth
        self.max_cap_sell_eth = max_cap_sell_eth
        self.fee_in_precents = fee_in_precents

    def calc_balances_based_on_pmin_pmax(self,
                                         min_token_to_eth_rate,
                                         max_token_to_eth_rate):

        print("\ncalc_balances_based_on_pmin_pmax:")

        E_0_ether = (1/self.rate) * np.log(self.P_0_tokens_to_eth / min_token_to_eth_rate)
        print("E_0_ether: " + str(E_0_ether))

        T_0_tokens = (1/self.rate) * (1/self.P_0_tokens_to_eth - 1/ max_token_to_eth_rate)
        print("T_0_tokens: " + str(T_0_tokens))

        T_0_tokens_in_eth = T_0_tokens * self.P_0_tokens_to_eth
        print("T_0_tokens_in_eth: " + str(T_0_tokens_in_eth))

        return E_0_ether, T_0_tokens

    def calc_pmin_pmax_ratio_based_on_balances(self,
                                               E_0_ether,
                                               T_0_tokens):

        print("\ncalc_pmin_pmax_ratio_based_on_balances:")

        # auto calculated values in natural units (Eth, Tokens)
        max_token_to_eth_rate = self.P_0_tokens_to_eth / (1 - self.rate * self.P_0_tokens_to_eth * T_0_tokens)
        min_token_to_eth_rate = self.P_0_tokens_to_eth / np.exp(self.rate * E_0_ether)
        pmin_ratio = min_token_to_eth_rate / self.P_0_tokens_to_eth
        pmax_ratio = max_token_to_eth_rate / self.P_0_tokens_to_eth
        print("minimal_pmin_ratio: " + str(pmin_ratio))
        print("maximal_pmax_ratio: " + str(pmax_ratio))

        return pmin_ratio, pmax_ratio

    def calc_params_based_on_ratios(self,
                                    pmin_ratio,
                                    pmax_ratio):

        print("\ncalc_params_based_on_ratios:")

        print("params in human units: ")
        # auto calculated values in natural units (Eth, Tokens)
        max_token_to_eth_rate = pmax_ratio * self.P_0_tokens_to_eth
        min_token_to_eth_rate = pmin_ratio * self.P_0_tokens_to_eth

        print("P_0_tokens_to_eth:" + "%.20f" % self.P_0_tokens_to_eth)
        print("num_formula_precision_bits:" + str(self.num_formula_precision_bits))
        print("max_cap_buy_eth:" + str(self.max_cap_buy_eth))
        print("max_cap_sell_eth:" + str(self.max_cap_sell_eth))
        print("fee_in_precents:" + str(self.fee_in_precents))
        print("max_token_to_eth_rate:" + "%.20f" % max_token_to_eth_rate)
        print("min_token_to_eth_rate:" + "%.20f" % min_token_to_eth_rate)
        print("pmin_ratio:" + str(pmin_ratio))
        print("pmax_ratio:" + str(pmax_ratio))

        print("\nparams to configure in contract units (Wei, Precision): ")
        _rInFp = self.rate * (2**self.num_formula_precision_bits)
        _pMinInFp = min_token_to_eth_rate * (2 ** self.num_formula_precision_bits)
        _numFpBits = self.num_formula_precision_bits
        _maxCapBuyInWei = self.max_cap_buy_eth * (10 ** 18)
        _maxCapSellInWei = self.max_cap_sell_eth * (10 ** 18)
        _feeInBps = self.fee_in_precents * 100
        _maxTokenToEthRateInPrecision = max_token_to_eth_rate * (10 ** 18)
        _minTokenToEthRateInPrecision = min_token_to_eth_rate * (10 ** 18)

        print("_rInFp: " + str(_rInFp))
        print("_pMinInFp: " + str(_pMinInFp))
        print("_numFpBits: " + str(_numFpBits))
        print("_maxCapBuyInWei: " + "%.20f" % _maxCapBuyInWei)
        print("_maxCapSellInWei: " + "%.20f" % _maxCapSellInWei)
        print("_feeInBps: " + str(_feeInBps))
        print("_maxTokenToEthRateInPrecision: " + str(_maxTokenToEthRateInPrecision))
        print("_minTokenToEthRateInPrecision: " + str(_minTokenToEthRateInPrecision))


knc_options = { "token": "knc",
                "p0": 0.00229499,
                "options": [{"rate": 0.01,
                             "min_token_to_eth_ratio": 0.7,
                             "max_token_to_eth_ratio": 1.3},
                            {"rate": 0.01,
                             "min_token_to_eth_ratio": 0.8,
                             "max_token_to_eth_ratio": 1.2},
                            {"rate": 0.01,
                             "min_token_to_eth_ratio": 0.9,
                             "max_token_to_eth_ratio": 1.1},
                            {"rate": 0.005,
                             "min_token_to_eth_ratio": 0.7,
                             "max_token_to_eth_ratio": 1.3}]
             }

dai_options = { "token": "dai",
                "p0": 0.00209461,
                "options": [{"rate": 0.01,
                             "min_token_to_eth_ratio": 0.7,
                             "max_token_to_eth_ratio": 1.3},
                            {"rate": 0.01,
                             "min_token_to_eth_ratio": 0.8,
                             "max_token_to_eth_ratio": 1.2},
                            {"rate": 0.01,
                             "min_token_to_eth_ratio": 0.9,
                             "max_token_to_eth_ratio": 1.1},
                            {"rate": 0.0075,
                             "min_token_to_eth_ratio": 0.8,
                             "max_token_to_eth_ratio": 1.2}]
             }

bbo_options = { "token": "bbo",
                "p0": 0.00001077,
                "options": [{"rate": 0.01,
                             "min_token_to_eth_ratio": 0.5,
                             "max_token_to_eth_ratio": 2.0}]
             }

midas_options = { "token": "midas",
                  "p0": 0.0001, # 1m tokens = 100 eth
                  "options": [{"rate": 0.01 * 0.693,
                               "min_token_to_eth_ratio": 0.5,
                               "max_token_to_eth_ratio": 2.0}]
             }

for token_options in [midas_options]:
    print("*********************************************")

    print("token: " + str(token_options["token"]))
    print("current price: " + str(token_options["p0"]))

    for option in token_options["options"]:
        print("****\n" + str(option))

        liq = LiquidityParams(rate=option["rate"],
                              P_0_tokens_to_eth=token_options["p0"],
                              num_formula_precision_bits=40,
                              max_cap_buy_eth=3.0,
                              max_cap_sell_eth=3.0,
                              fee_in_precents=0.25)


        # calculate ptoential minimal and maximal ratios according to fix amounts the rm is willing to put (100 eth, 1M tokens).
        (minimal_pmin_ratio, maximal_pmax_ratio) = liq.calc_pmin_pmax_ratio_based_on_balances(E_0_ether=100.0, T_0_tokens=1000000)
        # actually use pmin and pmax as fixed 0.5 and 2.0
        (pmin_ratio, pmax_ratio) = (0.5, 2.0)
        liq.calc_params_based_on_ratios(pmin_ratio, pmax_ratio)

        #E_0_ether, T_0_tokens = liq.calc_balances_based_on_pmin_pmax(
        #    min_token_to_eth_rate=option["min_token_to_eth_ratio"] * token_options["p0"],
        #    max_token_to_eth_rate=option["max_token_to_eth_ratio"] * token_options["p0"]
        #)

        #liq.calc_params_based_on_ratios(option["min_token_to_eth_ratio"],
        #                                option["max_token_to_eth_ratio"])
