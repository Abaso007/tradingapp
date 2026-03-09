import React, { useState, useEffect, useCallback } from "react";
import Axios from "axios";
import config from "../../config/Config";
import styles from "../Template/PageTemplate.module.css";
import clsx from "clsx";
import { styled } from "@mui/system";
import { Box, Container, Divider, Grid, Paper, Typography } from "@mui/material";
import Chart from "./Chart";
import Balance from "./Balance";
import Purchases from "./Purchases";
import Portfolios from "./Portfolios";
import Orders from "./Orders";
import Copyright from "../Template/Copyright";
import Title from "../Template/Title.jsx";
import { logDebug, logWarn, logError } from "../../utils/logger";

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  display: "flex",
  overflow: "auto",
  flexDirection: "column",
}));

const FixedHeightPaper = styled(StyledPaper)({
  height: 350,
});

const Dashboard = ({ userData, setUserData, onViewStrategyLogs }) => {
  const [purchasedStocks, setPurchasedStocks] = useState([]);
  const [accountBalance, setAccountBalance] = useState(0);
  const [orderList, setOrderList] = useState({ orders: [], positions: [] });
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState(null);
  const [portfolios, setPortfolios] = useState([]);
  const userId = userData?.user?.id;
  const token = userData?.token;
  const polymarketVirtualFunds = (portfolios || []).reduce((sum, portfolio) => {
    if (portfolio?.provider !== "polymarket") {
      return sum;
    }
    const cashLimit = Number(portfolio?.cashLimit ?? portfolio?.budget ?? null);
    return sum + (Number.isFinite(cashLimit) ? cashLimit : 0);
  }, 0);

  // Function to get the list of purchased stocks from the server using Alpacas API
  const getPurchasedStocks = useCallback(async () => {
    try {
      if (!token || !userId) {
        setPurchasedStocks([]);
        setAccountBalance(0);
        return;
      }
      logDebug('Fetching stocks for user:', userId);
      const url = config.base_url + `/api/stock/${userId}`;
      const headers = {
        "x-auth-token": token,
      };

      const response = await Axios.get(url, { headers });
      logDebug('Stocks API Response:', response.data);

      if (response.data.status === "success") {
        setPurchasedStocks(response.data.stocks);
        setAccountBalance(response.data.cash);
      } else {
        logWarn('Failed to fetch stocks:', response.data);
        setPurchasedStocks([]);
        setAccountBalance(0);
      }
    } catch (error) {
      logError('Error in getPurchasedStocks:', error);
      setPurchasedStocks([]);
      setAccountBalance(0);
    }
  }, [token, userId]);

  // Function to get the list of orders from the server using Alpacas API
  const getOrderList = useCallback(async () => {
    try {
      if (!token || !userId) {
        setOrderList({ orders: [], positions: [] });
        setOrdersError(null);
        return;
      }
      setOrdersLoading(true);
      setOrdersError(null);
      logDebug('Fetching orders for user:', userId);
      const url = config.base_url + `/api/order/${userId}`;
      const headers = {
        "x-auth-token": token,
      };

      const response = await Axios.get(url, { headers });
      logDebug('Orders API Response:', response.data);

      if (response.data.status === "success") {
        setOrderList({
          orders: response.data.orders || [],
          positions: response.data.positions || []
        });
        logDebug('Loaded orders count:', (response.data.orders || []).length);
        setOrdersError(null);
      } else {
        logWarn('Failed to fetch orders:', response.data);
        setOrderList({ orders: [], positions: [] });
        setOrdersError(response.data.message || "Unable to load order history.");
      }
    } catch (error) {
      logError('Error in getOrderList:', error);
      setOrderList({ orders: [], positions: [] });
      setOrdersError(error.response?.data?.message || error.message);
    } finally {
      setOrdersLoading(false);
    }
  }, [token, userId]);

  // Function to get the Strategy Portfolios from the server using MangoDB
  const getPortfolio = useCallback(async () => {
    try {
      if (!token || !userId) {
        setPortfolios([]);
        return;
      }
      const url = config.base_url + `/api/strategies/portfolios/${userId}`;
      const headers = {
        "x-auth-token": token,
      };
  
      const response = await Axios.get(url, { headers });
  
      if (response.data.status === "success") {
        setPortfolios(response.data.portfolios);
        logDebug("Portfolios ", response.data.portfolios);
      } else {
        setPortfolios([]);
      }
    } catch (error) {
      logError('Error fetching portfolios:', error);
    }
  }, [token, userId]);

  useEffect(() => {
    getPurchasedStocks();
    getOrderList();
    getPortfolio();
  }, [getPurchasedStocks, getOrderList, getPortfolio]);

  return (
    <Container maxWidth="lg" className={styles.container}>
      <Grid container spacing={3} marginTop="15px">
        {/* Chart */}
        <Grid item xs={12} md={8} lg={9}>
          <FixedHeightPaper>
            <Chart />
          </FixedHeightPaper>
        </Grid>

        {/* Balance */}
        <Grid item xs={12} md={4} lg={3}>
          <FixedHeightPaper>
          <Balance
            accountBalance={accountBalance}
            purchasedStocks={purchasedStocks}
            polymarketVirtualFunds={polymarketVirtualFunds}
          />
          </FixedHeightPaper>
        </Grid>

        {/* Strategy Portfolio */}
        <Grid item xs={12}>
          <StyledPaper>
            <Portfolios
              accountBalance={accountBalance}
              portfolios={portfolios}
              onViewStrategyLogs={onViewStrategyLogs}
              refreshPortfolios={getPortfolio}
            />
          </StyledPaper>
        </Grid>

        {/* Stocks */}
        <Grid item xs={12}>
          <StyledPaper>
            <Title>Stocks</Title>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Stocks in Your Portfolio
                </Typography>
                <Purchases
                  accountBalance={accountBalance}
                  purchasedStocks={purchasedStocks}
                  showTitle={false}
                />
              </Box>
              <Divider />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Order History
                </Typography>
                <Orders
                  orderList={orderList}
                  loading={ordersLoading}
                  error={ordersError}
                  showTitle={false}
                />
              </Box>
            </Box>
          </StyledPaper>
        </Grid>
      </Grid>
      <Box pt={4}>
        <Copyright />
      </Box>
    </Container>
  );
};

export default Dashboard;
