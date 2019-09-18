pragma solidity 0.5.11;


contract V5Example {
    uint public myVariable;

    constructor() public {
        myVariable = 5;
    }

    function setVariable(uint number) public {
        myVariable = number;
    }
}
