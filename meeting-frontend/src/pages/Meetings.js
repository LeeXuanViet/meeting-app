import React, { useEffect, useState } from "react";
import { Container, Typography, Card, CardContent, Grid } from "@mui/material";
import axios from "axios";

const Meetings = () => {
  const [meetings, setMeetings] = useState([]);
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchMeetings = async () => {
      const res = await axios.get("https://bkmeeting.soict.io/api/meetings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMeetings(res.data);
    };
    fetchMeetings();
  }, [token]);

  return (
    <Container sx={{ mt: 5 }}>
      <Typography variant="h5" gutterBottom>
        Danh sách cuộc họp
      </Typography>
      <Grid container spacing={2}>
        {meetings.map((m) => (
          <Grid item xs={12} md={6} key={m._id}>
            <Card>
              <CardContent>
                <Typography variant="h6">{m.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {m.description}
                </Typography>
                <Typography variant="caption">
                  Tạo bởi: {m.createdBy?.username}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
};

export default Meetings;
