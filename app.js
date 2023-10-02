const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const express = require("express");
const bodyParser = require("body-parser");
const logger = require("morgan");
const http = require("http");
const cors = require("cors");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// const openai = require("openai");

// Configure your OpenAI API key
// openai.configure({
//   apiKey: "YOUR_OPENAI_API_KEY",
// });

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

// Create a writable stream to store video chunks
const videoChunks = [];
let isRecording = false;

 // Handle WebSocket connections
wss.on("connection", (ws) => {

  ws.on("message", (message) => {
    
    if (message === "startRecording") {
      isRecording = true;
      videoChunks.length = 0;
    } else if (message === "stopRecording") {
      isRecording = false;
      saveVideoToFile(); 
    } else if (isRecording) {
      videoChunks.push(message);
    }
  });
});

app.use(cors(corsOptions));
app.use(logger("dev"));
app.use(bodyParser.json({ limit: "500mb", type: "application/json" }));
app.use(express.json({ limit: '500mb' })); 
app.use(
  express.urlencoded({
    extended: true,
    limit: "500mb",
    type: "application/x-www-form-urlencoded",
  })
);


// Serve an HTML page to the client
// app.get("/", (req, res) => {
//   res.sendFile(path.join(__dirname, "index.html"));
// });

app.post("/record-video", (req, res) => {
  try {
    if (req.body.action === "startRecording") {
      isRecording = true;
      videoChunks.length = 0; // Clear any existing chunks
      res.status(200).json({ message: "Recording started" });
    } else if (req.body.action === "stopRecording") {
      isRecording = false;
   if (videoChunks.length > 0) {
     // Call saveVideoToFile with a callback to send the video URL in the response
     saveVideoToFile((videoUrl) => {
       res.status(200).json({ message: "Recording stopped", videoUrl });
     });
   } else {
     res.status(200).json({ message: "Recording stopped" });
   };
    } else if (isRecording && req.body.chunk) {
      videoChunks.push(req.body.chunk);
      res.status(200).json({ message: "Chunk received" });
    } else {
      res.status(400).json({ error: "Invalid request" });
    }
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/recordings/:identifier", (req, res) => {
  try {
    const identifier = req.params.identifier;
    const videoFileName = `recorded_video_${identifier}.mp4`;
    const videoPath = path.join(__dirname, "uploads", videoFileName);

    // Check if the video file exists
    if (fs.existsSync(videoPath)) {
      // Set the appropriate response headers for video streaming
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `inline; filename="${videoFileName}"`);

      // Create a read stream for the video file and pipe it to the response
      const videoStream = fs.createReadStream(videoPath);
      videoStream.pipe(res);

      // Handle any errors that may occur during streaming
      videoStream.on("error", (error) => {
        console.error("Error streaming video:", error);
        res.status(500).json({ error: "Internal server error" });
      });
    } else {
      // Return an error response if the recording is not found
      res.status(404).json({ error: "Recording not found" });
    }
  } catch (error) {
    console.error("Error retrieving recording:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Add this endpoint after configuring Express to serve static files
app.get("/recordings", (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, "uploads");

    // Read the contents of the 'uploads' directory to get a list of recordings
    fs.readdir(uploadsDir, (error, files) => {
      if (error) {
        console.error("Error reading recordings directory:", error);
        res.status(500).json({ error: "Internal server error" });
      } else {
        // Filter out only the video files (MP4 files)
        const videoFiles = files.filter((file) => file.endsWith(".mp4"));

        // Generate URLs for each video file
        const videoUrls = videoFiles.map((file) => {
          return `${getServerBaseUrl()}/uploads/${file}`;
        });

        // Return the list of video URLs as a response
        res.status(200).json({ recordings: videoUrls });

        // // Return the list of video files as a response
        // res.status(200).json({ recordings: videoFiles });
      }
    });
  } catch (error) {
    console.error("Error retrieving recordings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});



// Start your server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Function to save recorded video to a file
function saveVideoToFile(callback) {
  if (videoChunks.length === 0) {
    console.log("No video data to save.");
    return;
  }

  // Generate a unique file name based on a timestamp
  const timestamp = Date.now();
  const videoFileName = `recorded_video_${timestamp}.mp4`;
  const videoPath = path.join(__dirname, "uploads", videoFileName);
  const videoStream = fs.createWriteStream(videoPath, { flags: "a" }); // Append mode

  //   videoChunks.forEach((chunk) => {
  //     videoStream.write(chunk);
  //   });
  videoChunks.forEach((chunk) => {
    const buffer = Buffer.from(chunk, "base64");
    videoStream.write(buffer);
  });

  videoStream.end();

  videoStream.on("finish", () => {
    console.log("Video saved to:", videoPath);

    // Generate the URL to access the recorded video
    const videoUrl = `${getServerBaseUrl()}/uploads/${videoFileName}`;
    console.log("Video URL:", videoUrl);

    // Invoke the callback with the videoUrl
    callback(videoUrl);
  });

  videoStream.on("error", (error) => {
    console.error("Error saving video:", error);
  });
}

// Helper function to get the base URL of the server
function getServerBaseUrl() {
//   const port = process.env.PORT || 3000;
//   const baseUrl = process.env.BASE_URL
  return `https://helpmeout-sgbj.onrender.com`;
}

