const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const Location = require("./models/Location"); // Ensure this path is correct
const User = require("./models/User"); // Import User model once

const app = express();
const port = process.env.PORT || 3000;

// MongoDB connection without deprecated options
mongoose
  .connect(process.env.DB_CONNECTION_STRING, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB successfully"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Monitor MongoDB connection
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// Use CORS
app.use(cors());

// Middleware to parse JSON bodies with error handling
app.use(express.json());
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).send({ error: "Invalid JSON" });
  }
  next();
});

// Serve frontend in production
if (process.env.NODE_ENV === "production") {
  const frontendPath = path.join(__dirname, "../frontend/dist");
  app.use(express.static(frontendPath));

  // All unknown routes should be handed to React app
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

// POST endpoint for saving location
app.post("/send-location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    // Validate input
    if (latitude == null || longitude == null) {
      return res.status(400).json({
        error: "Missing required fields",
        received: req.body,
      });
    }

    // Validate number types and ranges
    if (!isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        error: "Invalid latitude value",
        received: latitude,
      });
    }

    if (!isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: "Invalid longitude value",
        received: longitude,
      });
    }

    // Create and save location
    const newLocation = new Location({ latitude, longitude });
    const savedLocation = await newLocation.save();

    res.status(200).json({
      message: "Location saved successfully",
      location: savedLocation,
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
});

// GET endpoint to fetch locations
app.get("/locations", async (req, res) => {
  try {
    const locations = await Location.find().sort("-createdAt").limit(10);
    res.status(200).json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({
      error: "Error fetching locations",
      message: error.message,
    });
  }
});

// GET endpoint to fetch all registered users
app.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude passwords
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
});

// POST endpoint for registering a user
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email is already registered" });
    }

    const newUser = new User({ username, email, password });
    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ error: "Server error", message: error.message });
  }
});

// POST endpoint for user login (secure method for handling sensitive data)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Fetch user from database
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Compare passwords (if passwords are hashed, adjust accordingly)
    const isPasswordValid = password === user.password; // Replace with bcrypt.compare if using hashed passwords
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
});

// GET endpoint for user login (less secure; only for testing or non-sensitive purposes)
app.get("/login", async (req, res) => {
    try {
      const { email, password } = req.query; // Ensure these are passed as query strings
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
  
      // Fetch user from database
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
  
      // Compare passwords
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
  
      res.status(200).json({
        message: "Login successful",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({
        error: "Server error",
        message: error.message,
      });
    }
  });
// Start the server with error handling
const server = app
  .listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
  });

// Handle process termination
process.on("SIGTERM", async () => {
  try {
    await mongoose.connection.close(false); // Use async close
    console.log("Server closed. Database instance disconnected");
    process.exit(0);
  } catch (error) {
    console.error("Error closing database connection:", error);
    process.exit(1);
  }
});
