pragma solidity ^0.4.0;


contract Permissions {

    address public Admin;
    address public proposedAdmin;
    mapping(address=>bool) public Operators;
    mapping(address=>bool) public Alerters;
    address[] public OperatorsGroup;
    address[] public AlertersGroup;

    function Permissions() public {
        Admin = msg.sender;
    }

    modifier onlyAdmin() {
        require (msg.sender == Admin);
        _;
    }

    modifier onlylOperator() {
        require (Operators[msg.sender]);
        _;
    }

    modifier onlyAlerter() {
        require (Alerters[msg.sender]);
        _;
    }

    function requestOwnershipTransfer( address newAdmin ) public
        onlyAdmin
    {
        proposedAdmin = newAdmin;
    }

    function acceptOwnerShip() public {
        if (msg.sender != proposedAdmin) revert ();
        Admin = proposedAdmin;
    }

    function addAlerter( address newAlerter ) public
        onlyAdmin
    {
        Alerters[newAlerter] = true;
        AlertersGroup.push(newAlerter);
    }

    function removeAlerter ( address toRemove ) public
        onlyAdmin
    {
        //TODO - return success?
        //TODO - can alerter remove himself? or only admin?
        if (!Alerters[toRemove]) revert();

        for (uint i = 0; i < AlertersGroup.length; ++i)
        {
            if (AlertersGroup[i] == toRemove)
            {
                AlertersGroup[i] = AlertersGroup[AlertersGroup.length - 1];
                AlertersGroup.length -= 1;
                break;
            }
        }
    }

    function addOperator( address newOperator ) public
        onlyAdmin
    {
        Operators[newOperator] = true;
        OperatorsGroup.push(newOperator);
    }

    function removeOperator ( address toRemove ) public
        onlyAdmin
    {
        //TODO - return success?
        //TODO - can alerter remove himself? or only admin?
        if (!Operators[toRemove]) revert();

        for (uint i = 0; i < OperatorsGroup.length; ++i)
        {
            if (OperatorsGroup[i] == toRemove)
            {
                OperatorsGroup[i] = OperatorsGroup[OperatorsGroup.length - 1];
                OperatorsGroup.length -= 1;
                break;
            }
        }
    }

    function getAlerters () public view returns (address[] alerters) {
        //TODO limit this function call?
        return AlertersGroup;
    }

    function getOperators () public view returns (address[] operators) {
        //TODO limit this function call?
        return OperatorsGroup;
    }
}
