pragma solidity ^0.4.18;


interface PermissionGroupsInterface {
    function transferAdmin(address newAdmin) public;
    function claimAdmin() public;
    function addAlerter( address newAlerter ) public;
    function removeAlerter ( address alerter ) public;
    function addOperator( address newOperator ) public;
    function removeOperator ( address operator ) public;
}


contract PermissionGroups {

    address public admin;
    address public pendingAdmin;
    mapping(address=>bool) public operators;
    mapping(address=>bool) public alerters;
    address[] public operatorsGroup;
    address[] public alertersGroup;

    function PermissionGroups() public {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require (msg.sender == admin);
        _;
    }

    modifier onlyOperator() {
        require (operators[msg.sender]);
        _;
    }

    modifier onlyAlerter() {
        require (alerters[msg.sender]);
        _;
    }

    event TransferAdmin( address pendingAdmin );
    /**
     * @dev Allows the current admin to set the pendingAdmin address.
     * @param newAdmin The address to transfer ownership to.
     */
    function transferAdmin(address newAdmin) public
        onlyAdmin
    {
        require(newAdmin !=  address(0));
        TransferAdmin(pendingAdmin);
        pendingAdmin = newAdmin;
    }

    event ClaimAdmin( address newAdmin, address previousAdmin);

    /**
     * @dev Allows the pendingAdmin address to finalize the change admin process.
     */
    function claimAdmin() public {
        require(pendingAdmin == msg.sender);
        ClaimAdmin(pendingAdmin, admin);
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }

    event AddAlerter ( address newAlerter );

    function addAlerter( address newAlerter ) public
        onlyAdmin
    {
        require(!alerters[newAlerter]); // prevent duplicates.
        AddAlerter(newAlerter);
        alerters[newAlerter] = true;
        alertersGroup.push(newAlerter);
    }

    event RemoveAlerter ( address alerter );

    function removeAlerter ( address alerter ) public
        onlyAdmin
    {
        if (!alerters[alerter]) revert();

        for (uint i = 0; i < alertersGroup.length; ++i)
        {
            if (alertersGroup[i] == alerter)
            {
                alertersGroup[i] = alertersGroup[alertersGroup.length - 1];
                alertersGroup.length--;
                RemoveAlerter(alerter);
                break;
            }
        }
    }

    event AddOperator( address newOperator );

    function addOperator( address newOperator ) public
        onlyAdmin
    {
        require(!operators[newOperator]); // prevent duplicates.
        AddOperator(newOperator);
        operators[newOperator] = true;
        operatorsGroup.push(newOperator);
    }

    event RemoveOperator ( address operator );

    function removeOperator ( address operator ) public
        onlyAdmin
    {
        if (!operators[operator]) revert();

        for (uint i = 0; i < operatorsGroup.length; ++i)
        {
            if (operatorsGroup[i] == operator)
            {
                operatorsGroup[i] = operatorsGroup[operatorsGroup.length - 1];
                operatorsGroup.length -= 1;
                RemoveOperator(operator);
                break;
            }
        }
    }
}