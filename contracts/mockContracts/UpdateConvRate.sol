pragma solidity ^0.4.18;


interface ERC20 {
    function transferFrom(address _from, address _to, uint _value) public returns (bool success);
}

interface TokenConfigInterface {
    function admin() public returns(address);
    function claimAdmin() public;
    function transferAdminQuickly(address newAdmin) public;

    // conversion rate
    function setTokenControlInfo(
        address token,
        uint minimalRecordResolution,
        uint maxPerBlockImbalance,
        uint maxTotalImbalance
    ) public;
}


contract UpdateConvRate {
    TokenConfigInterface public conversionRate;

//    address public ETH = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    ERC20 public ENG = ERC20(0xf0Ee6b27b759C9893Ce4f094b49ad28fd15A23e4);
    ERC20 public SALT = ERC20(0x4156D3342D5c385a87D264F90653733592000581);
    ERC20 public APPC = ERC20(0x1a7a8BD9106F2B8D977E08582DC7d24c723ab0DB);
    ERC20 public RDN = ERC20(0x255Aa6DF07540Cb5d3d297f0D0D4D84cb52bc8e6);
    ERC20 public OMG = ERC20(0xd26114cd6EE289AccF82350c8d8487fedB8A0C07);
    ERC20 public KNC = ERC20(0xdd974D5C2e2928deA5F71b9825b8b646686BD200);
    ERC20 public EOS = ERC20(0x86Fa049857E0209aa7D9e616F7eb3b3B78ECfdb0);
    ERC20 public SNT = ERC20(0x744d70FDBE2Ba4CF95131626614a1763DF805B9E);
    ERC20 public ELF = ERC20(0xbf2179859fc6D5BEE9Bf9158632Dc51678a4100e);
    ERC20 public POWR = ERC20(0x595832F8FC6BF59c85C527fEC3740A1b7a361269);
    ERC20 public MANA = ERC20(0x0F5D2fB29fb7d3CFeE444a200298f468908cC942);
    ERC20 public BAT = ERC20(0x0D8775F648430679A709E98d2b0Cb6250d2887EF);
    ERC20 public REQ = ERC20(0x8f8221aFbB33998d8584A2B05749bA73c37a938a);
    ERC20 public GTO = ERC20(0xC5bBaE50781Be1669306b9e001EFF57a2957b09d);

    function UpdateConvRate (TokenConfigInterface _conversionRate) public {
        conversionRate = _conversionRate;
    }

    function setTokensControlInfo() public {
        address orgAdmin = conversionRate.admin();
        conversionRate.claimAdmin();

        conversionRate.setTokenControlInfo(
            KNC,
            1000000000000000,
            3209682992192817725440,
            5685953420669578379264 );

        conversionRate.setTokenControlInfo(
            OMG,
            1000000000000000,
            401531338213762269184,
            711312765645680017408 );


        conversionRate.setTokenControlInfo(
            EOS,
            1000000000000000,
            857086802686433558528,
            1518329270959017033728 );


        conversionRate.setTokenControlInfo(
            SNT,
            10000000000000000,
            39473220400186602291200,
            51279660621882430849024 );

        conversionRate.setTokenControlInfo(
            GTO,
            10,
            1298406206,
            1298406206);


        conversionRate.setTokenControlInfo(
            REQ,
            1000000000000000,
            26380249265656293228544,
            34270581821014091497472);

        conversionRate.setTokenControlInfo(
            BAT,
            1000000000000000,
            13630787405152438452224,
            13630787405152438452224);


        conversionRate.setTokenControlInfo(
            MANA,
            1000000000000000,
            46922655822319550726144,
            46922655822319550726144);

        conversionRate.setTokenControlInfo(
            POWR,
            1000,
            7698525732,
            7698525732);


        conversionRate.setTokenControlInfo(
            ELF,
            1000000000000000,
            5135835425728323649536,
            6671963801563665793024);

        conversionRate.setTokenControlInfo(
            APPC,
            1000000000000000,
            9671281647528360017920,
            12563961988304091480064);

        conversionRate.setTokenControlInfo(
            ENG,
            10000,
            277385502667,
            360351506515);

        conversionRate.setTokenControlInfo(
            RDN,
            1000000000000000    ,
            2164249905248327172096,
            2811577051908102684672);

        conversionRate.setTokenControlInfo(
            SALT,
            10000,
            121452449847,
            121452449847);

        conversionRate.transferAdminQuickly(orgAdmin);
        require(orgAdmin == conversionRate.admin());
    }
}