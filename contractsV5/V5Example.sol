pragma solidity 0.5.11;


contract V5Example {
    uint public myVariable;

    constructor() public {
        myVariable = 5;
    }

    function setVariable(uint number) public {
        myVariable = number;
    }

    function variableMustBeFive() public view {
        require(myVariable == 5, "variable not equal to 5");
    }
}
