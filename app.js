const express = require("express");
const axios = require("axios");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

// SQLite database file path
const dbPath = "./my_database.db";

// Connect to the SQLite database
const db = new sqlite3.Database(dbPath);

// Function to initialize the database with seed data
async function initializeDatabase() {
  try {
    // Fetch data from the third-party API
    const apiURL =
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json";
    const response = await axios.get(apiURL);
    const data = response.data;

    // Create the "products" table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        title TEXT,
        price REAL,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale DATETIME
      )
    `;

    db.run(createTableQuery, (err) => {
      if (err) {
        console.error("Error creating table:", err.message);
      } else {
        console.log('Table "products" created or already exists');

        // Insert the fetched data into the "products" table
        const insertDataQuery = `
          INSERT INTO products (id, title, price, description, category, image, sold, dateOfSale)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertPromises = data.map((item) => {
          return new Promise((resolve, reject) => {
            db.run(
              insertDataQuery,
              [
                item.id,
                item.title,
                item.price,
                item.description,
                item.category,
                item.image,
                item.sold,
                item.dateOfSale,
              ],
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          });
        });

        Promise.all(insertPromises)
          .then(() => {
            console.log('Data inserted into the "products" table');
          })
          .catch((error) => {
            console.error("Error inserting data:", error);
          });
      }
    });

    // Close the database connection
    db.close();

    console.log("Database initialized with seed data");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Middleware to parse incoming JSON data
app.use(express.json());

// API to initialize the database with seed data
app.get("/initialize-database", async (req, res) => {
  await initializeDatabase();
  res.json({ message: "Database initialized with seed data" });
});

// API to get statistics for the selected month
app.get("/statistics/:month", async (req, res) => {
  try {
    const { month } = req.params;

    // Validate the input month
    const inputMonth = parseInt(month);
    if (isNaN(inputMonth) || inputMonth < 1 || inputMonth > 12) {
      return res.status(400).json({
        error: "Invalid month. Please provide a valid month between 1 and 12.",
      });
    }

    // Query to get statistics
    const query = `
      SELECT
        SUM(price) AS totalSaleAmount,
        COUNT(*) AS totalItems,
        SUM(CASE WHEN sold = 1 THEN 1 ELSE 0 END) AS totalSoldItems,
        SUM(CASE WHEN sold = 0 THEN 1 ELSE 0 END) AS totalUnsoldItems
      FROM
        products
      WHERE
        strftime('%m', dateOfSale) = ?;
    `;

    db.all(query, [inputMonth.toString().padStart(2, "0")], (err, result) => {
      if (err) {
        console.error("Error getting statistics:", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.json(result[0]);
      }
    });
  } catch (error) {
    console.error("Error getting statistics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to generate bar chart for the selected month
app.get("/bar-chart/:month", async (req, res) => {
  try {
    const { month } = req.params;

    // Validate the input month
    const inputMonth = parseInt(month);
    if (isNaN(inputMonth) || inputMonth < 1 || inputMonth > 12) {
      return res.status(400).json({
        error: "Invalid month. Please provide a valid month between 1 and 12.",
      });
    }

    // Query to get bar chart data
    const query = `
      SELECT
        CASE
          WHEN price >= 0 AND price <= 100 THEN '0 - 100'
          WHEN price > 100 AND price <= 200 THEN '101 - 200'
          WHEN price > 200 AND price <= 300 THEN '201 - 300'
          WHEN price > 300 AND price <= 400 THEN '301 - 400'
          WHEN price > 400 AND price <= 500 THEN '401 - 500'
          WHEN price > 500 AND price <= 600 THEN '501 - 600'
          WHEN price > 600 AND price <= 700 THEN '601 - 700'
          WHEN price > 700 AND price <= 800 THEN '701 - 800'
          WHEN price > 800 AND price <= 900 THEN '801 - 900'
          ELSE '901-above'
        END AS priceRange,
        COUNT(*) AS itemCount
      FROM
        products
      WHERE
        strftime('%m', dateOfSale) = ?
      GROUP BY
        priceRange;
    `;

    db.all(query, [inputMonth.toString().padStart(2, "0")], (err, result) => {
      if (err) {
        console.error("Error generating bar chart:", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.json(result);
      }
    });
  } catch (error) {
    console.error("Error generating bar chart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to generate pie chart for the selected month
app.get("/pie-chart/:month", async (req, res) => {
  try {
    const { month } = req.params;

    // Validate the input month
    const inputMonth = parseInt(month);
    if (isNaN(inputMonth) || inputMonth < 1 || inputMonth > 12) {
      return res.status(400).json({
        error: "Invalid month. Please provide a valid month between 1 and 12.",
      });
    }

    // Query to get pie chart data
    const query = `
      SELECT
        category,
        COUNT(*) AS itemCount
      FROM
        products
      WHERE
        strftime('%m', dateOfSale) = ?
      GROUP BY
        category;
    `;

    db.all(query, [inputMonth.toString().padStart(2, "0")], (err, result) => {
      if (err) {
        console.error("Error generating pie chart:", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.json(result);
      }
    });
  } catch (error) {
    console.error("Error generating pie chart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to fetch data from all three APIs and combine the response
app.get("/combined-data/:month", async (req, res) => {
  try {
    const { month } = req.params;

    // Fetch statistics
    const statisticsResponse = await axios.get(
      `http://localhost:3000/statistics/${month}`
    );
    const statisticsData = statisticsResponse.data;

    // Fetch bar chart data
    const barChartResponse = await axios.get(
      `http://localhost:3000/bar-chart/${month}`
    );
    const barChartData = barChartResponse.data;

    // Fetch pie chart data
    const pieChartResponse = await axios.get(
      `http://localhost:3000/pie-chart/${month}`
    );
    const pieChartData = pieChartResponse.data;

    // Combine the response data
    const combinedData = {
      statistics: statisticsData,
      barChart: barChartData,
      pieChart: pieChartData,
    };

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching combined data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Default route to handle invalid requests
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
