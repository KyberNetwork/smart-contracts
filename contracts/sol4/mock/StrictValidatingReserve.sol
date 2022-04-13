pragma solidity 0.4.18;

import '../reserves/NimbleReserve.sol';

import './TempBank.sol';


/*
 * @title NimbleReserve with check conversionRate before doTrade
 */
contract StrictValidatingReserve is NimbleReserve {
	TempBank bank;

	function StrictValidatingReserve(address _NimbleNetwork, ConversionRatesInterface _ratesContract, address _admin)
		public
		NimbleReserve(_NimbleNetwork, _ratesContract, _admin)
	{}

	function setBank(TempBank _bank) public {
		bank = _bank;
	}

	function doTrade(ERC20 srcToken, uint256 srcAmount, ERC20 destToken, address destAddress, uint256 conversionRate, bool validate)
		internal
		returns (bool)
	{
		if (bank != TempBank(0))
			bank.transfer(msg.value); // reduce the reserve balance before the call
		uint256 expecedRate = getConversionRate(srcToken, destToken, srcAmount, block.number);
		require(expecedRate >= conversionRate);
		require(NimbleReserve.doTrade(srcToken, srcAmount, destToken, destAddress, conversionRate, validate));
		if (bank != TempBank(0))
			bank.withdraw(); // transfer ether back to reserve contract
		return true;
	}
}
