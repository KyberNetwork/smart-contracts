pragma solidity 0.4.18;


import "../reserves/fprConversionRate/ConversionRates.sol";
import "../ERC20Interface.sol";


contract WrapReadTokenData {
    function WrapReadTokenData() public { }

    function readQtyStepFunctions(ConversionRates rate, ERC20 token) public view returns(
        int numBuyRateQtySteps, 
        int[] buyRateQtyStepsX, 
        int[] buyRateQtyStepsY,
        int numSellRateQtySteps,
        int[] SellRateQtyStepsX,
        int[] SellRateQtyStepsY)
    {
        uint i;
        numBuyRateQtySteps = rate.getStepFunctionData(token, 0, 0);
        buyRateQtyStepsX = new int[](uint(numBuyRateQtySteps));
        buyRateQtyStepsY = new int[](uint(numBuyRateQtySteps));

        for (i = 0; i < uint(numBuyRateQtySteps); i++) {
            buyRateQtyStepsX[i] = rate.getStepFunctionData(token, 1, i);
            buyRateQtyStepsY[i] = rate.getStepFunctionData(token, 3, i);
        }

        numSellRateQtySteps = rate.getStepFunctionData(token, 4, 0);
        SellRateQtyStepsX = new int[](uint(numSellRateQtySteps));
        SellRateQtyStepsY = new int[](uint(numSellRateQtySteps));
        
        for (i = 0; i < uint(numSellRateQtySteps); i++) {
            SellRateQtyStepsX[i] = rate.getStepFunctionData(token, 5, i);
            SellRateQtyStepsY[i] = rate.getStepFunctionData(token, 7, i);
        }
    }

    function readImbalanceStepFunctions(ConversionRates rate, ERC20 token) public view returns(
        int numBuyRateImbalanceSteps,
        int[] buyRateImbalanceStepsX,
        int[] buyRateImbalanceStepsY,
        int numSellRateImbalanceSteps,
        int[] SellRateImbalanceStepsX,
        int[] SellRateImbalanceStepsY)
    {
        uint i;
        numBuyRateImbalanceSteps = rate.getStepFunctionData(token, 8, 0);
        buyRateImbalanceStepsX = new int[](uint(numBuyRateImbalanceSteps));
        buyRateImbalanceStepsY = new int[](uint(numBuyRateImbalanceSteps));

        for (i = 0; i < uint(numBuyRateImbalanceSteps); i++) {
            buyRateImbalanceStepsX[i] = rate.getStepFunctionData(token, 9, i);
            buyRateImbalanceStepsY[i] = rate.getStepFunctionData(token, 11, i);
        }

        numSellRateImbalanceSteps = rate.getStepFunctionData(token, 12, 0);
        SellRateImbalanceStepsX = new int[](uint(numSellRateImbalanceSteps));
        SellRateImbalanceStepsY = new int[](uint(numSellRateImbalanceSteps));

        for (i = 0; i < uint(numSellRateImbalanceSteps); i++) {
            SellRateImbalanceStepsX[i] = rate.getStepFunctionData(token, 13, i);
            SellRateImbalanceStepsY[i] = rate.getStepFunctionData(token, 15, i);
        }
    }
}

